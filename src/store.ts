import { equals, uniq } from "ramda"
import { SetStateAction } from "react"
import { ValueOrFactory, callOrGet } from "value-or-factory"
import { FormErrorInput, FormErrors, buildErrors } from "./errors.js"
import type { FormHook } from "./hooks.js"
import { FormInitial, FormOptions } from "./options.js"
import { FormInternalState, deriveFormState, initialFormState } from "./state.js"

/**
 * Something that happens to a form field.
 */
export type FormFieldEvent = "touch" | "blur" | "commit" | "focus"

/**
 * A form's state and everything that changes it.
 *
 * Actions run straight away on the current state. The events they cause are queued, and delivered to listeners by
 * `flush`, once React has rendered the change (so listeners see the form as it now is). Each event is delivered once:
 * running effects again, as React does on a hot reload, finds nothing left to deliver.
 */
export interface FormStore<T> {

    readonly getState: () => FormInternalState<T>
    /**
     * Subscribe to state changes, for `useSyncExternalStore`.
     */
    readonly subscribe: (subscriber: () => void) => () => void
    /**
     * Listen for events, delivered by `flush`.
     */
    readonly listen: (hooks: readonly FormHook[], listener: () => void) => () => void
    /**
     * Deliver the queued events to their listeners.
     */
    readonly flush: () => void
    /**
     * Use these options from now on (they change from render to render).
     */
    readonly setOptions: (options: FormOptions<T>) => void
    /**
     * Apply a new initial value (and errors) as the options say to (`autoUpdate`). Does
     * nothing if they're the ones last applied.
     */
    readonly updateInitial: (next: FormInitial<T>) => void

    readonly setValue: (value: SetStateAction<T>, suppressTouch?: boolean | undefined) => void
    readonly setErrors: (errors: ValueOrFactory<FormErrorInput, [FormErrors]>) => void
    readonly mark: (event: FormFieldEvent) => void
    readonly validate: () => void
    readonly submit: () => void
    readonly reset: () => void
    readonly initialize: (value: T, errors?: FormErrors | undefined) => void
    /**
     * Take a value (and errors) as the saved one: like loading it, so the form has no unsaved edits afterwards.
     */
    readonly follow: (next: FormInitial<T>) => void

}

interface FormListener {

    readonly hooks: readonly FormHook[]
    readonly listener: () => void

}

export function createFormStore<T>(initialOptions: FormOptions<T>): FormStore<T> {

    // This is the store: the one place that holds mutable state, so the rest of the form doesn't have to.
    let options = initialOptions
    let state = initialFormState(initialOptions.initial)
    let initial: FormInitial<T> = { value: initialOptions.initial.value, errors: initialOptions.initial.errors }
    let queue: readonly FormHook[] = ["init"]
    let latestValidation = 0
    let resubmit = false
    const subscribers = new Set<() => void>()
    const listeners = new Set<FormListener>()

    const update = (updater: (state: FormInternalState<T>) => FormInternalState<T>, events: readonly FormHook[] = []) => {
        state = updater(state)
        queue = [...queue, ...events]
        subscribers.forEach(subscriber => subscriber())
    }

    const setValue = (value: SetStateAction<T>, suppressTouch = false) => {
        update(state => {
            return {
                ...state,
                value: callOrGet(value, state.value),
            }
        }, suppressTouch ? ["change"] : ["change", "touch"])
    }
    const setErrors = (errors: ValueOrFactory<FormErrorInput, [FormErrors]>) => {
        update(state => {
            return {
                ...state,
                errors: buildErrors(callOrGet(errors, state.errors ?? [])),
            }
        })
    }
    const initialize = (value: T, errors?: FormErrors | undefined) => {
        update(() => initialFormState({ value, errors }), ["init"])
    }
    const reset = () => {
        setValue(options.initial.value, true)
        setErrors(options.initial.errors)
    }
    // Takes a value as the form's starting point (see useFollowInitial): like loading it rather than an edit, so the
    // form has no unsaved edits afterwards. A change all the same, so it's validated again.
    const follow = (next: FormInitial<T>) => {
        update(state => {
            return {
                ...state,
                value: next.value,
                savedValue: next.value,
                errors: next.errors,
            }
        }, ["change"])
    }

    // A validation's result is used only if it's the latest one, and the form still has the value it validated.
    const validate = () => {
        const validator = options.validate
        if (validator === undefined) {
            return
        }
        latestValidation += 1
        const validation = latestValidation
        const value = state.value
        update(state => ({ ...state }), ["beforeValidate"])
        void (async () => {
            try {
                const errors = buildErrors(await validator(value), false)
                if (validation !== latestValidation || !equals(state.value, value)) {
                    return
                }
                update(state => ({ ...state, errors }), ["afterValidate"])
            }
            catch (exception) {
                update(state => ({ ...state, exception }))
            }
        })()
    }

    // One submission at a time. One asked for while another runs waits for it, then submits the form's value as it is
    // by then: however many were asked for meanwhile, that's one more (and none if the value is the one just submitted).
    const submit = () => {
        // errors that block saving (see canSubmit): nothing to submit until they're fixed
        if (!deriveFormState(state).canSubmit) {
            return
        }
        if (state.submitting) {
            resubmit = true
            return
        }
        const value = state.value
        update(state => ({ ...state, submitting: true }), ["beforeSubmit"])
        void (async () => {
            try {
                const errors = buildErrors(await options.submit(value), true)
                const succeeded = errors.length === 0
                update(state => {
                    return {
                        ...state,
                        submitting: false,
                        submitted: true,
                        // what was saved is now the value to compare against: edits made since stay dirty
                        savedValue: succeeded ? value : state.savedValue,
                        errors,
                    }
                }, ["afterSubmit"])
            }
            catch (exception) {
                update(state => ({ ...state, submitting: false, exception }))
                // it failed outright: don't go on to submit again
                resubmit = false
            }
            if (resubmit) {
                resubmit = false
                if (!equals(state.value, value)) {
                    submit()
                }
            }
        })()
    }

    return {
        getState: () => state,
        subscribe: subscriber => {
            subscribers.add(subscriber)
            return () => {
                subscribers.delete(subscriber)
            }
        },
        listen: (hooks, listener) => {
            const entry = { hooks, listener }
            listeners.add(entry)
            return () => {
                listeners.delete(entry)
            }
        },
        flush: () => {
            // an event that happened several times since the last flush is delivered once
            const events = uniq(queue)
            queue = []
            events.forEach(event => {
                [...listeners].filter(entry => entry.hooks.includes(event)).forEach(entry => entry.listener())
            })
        },
        setOptions: next => {
            options = next
        },
        updateInitial: next => {
            if (equals(initial, next)) {
                return
            }
            initial = next
            if (callOrGet(options.autoUpdate, deriveFormState(state))) {
                reset()
            }
        },
        setValue,
        setErrors,
        mark: event => {
            // Nothing to record, but a new state object all the same: the form renders again, and its events are
            // delivered after a render.
            update(state => ({ ...state }), [event])
        },
        validate,
        submit,
        reset,
        initialize,
        follow,
    }

}
