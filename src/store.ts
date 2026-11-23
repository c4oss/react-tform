import { equals, uniq } from "ramda"
import { SetStateAction } from "react"
import { ValueOrFactory, callOrGet } from "value-or-factory"
import { FormErrorInput, FormErrors, buildErrors } from "./errors.js"
import type { FormHook } from "./hooks.js"
import { FormOptions } from "./options.js"
import { FormInternalState, deriveFormState, initialFormState } from "./state.js"

/**
 * Something that happens to a form field, marked with when it last did.
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
     * Apply a new initial value (and errors) as the options say to (`autoUpdate`, `reinitializeOnUpdate`). Does
     * nothing if they're the ones last applied.
     */
    readonly updateInitial: (value: T, errors: FormErrors | undefined) => void

    readonly setValue: (value: SetStateAction<T>, suppressTouch?: boolean | undefined) => void
    readonly setErrors: (errors: ValueOrFactory<FormErrorInput, [FormErrors]>) => void
    readonly mark: (event: FormFieldEvent) => void
    readonly validate: () => void
    readonly submit: () => void
    readonly reset: () => void
    readonly initialize: (value: T, errors?: FormErrors | undefined) => void
    readonly reinitialize: () => void

}

interface FormListener {

    readonly hooks: readonly FormHook[]
    readonly listener: () => void

}

const FIELD_EVENT_DATES = {
    touch: "lastTouched",
    blur: "lastBlurred",
    commit: "lastCommitted",
    focus: "lastFocused",
} as const

export function createFormStore<T>(initialOptions: FormOptions<T>): FormStore<T> {

    // This is the store: the one place that holds mutable state, so the rest of the form doesn't have to.
    let options = initialOptions
    let state = initialFormState(initialOptions.initial.value, initialOptions.initial.errors)
    let initial = { value: initialOptions.initial.value, errors: initialOptions.initial.errors }
    let queue: readonly FormHook[] = ["init"]
    let latestValidation = 0
    let latestSubmission = 0
    const subscribers = new Set<() => void>()
    const listeners = new Set<FormListener>()

    const update = (updater: (state: FormInternalState<T>) => FormInternalState<T>, events: readonly FormHook[] = []) => {
        state = updater(state)
        queue = [...queue, ...events]
        subscribers.forEach(subscriber => subscriber())
    }

    const setValue = (value: SetStateAction<T>, suppressTouch = false) => {
        const now = new Date()
        const validating = options.validate !== undefined
        update(state => {
            return {
                ...state,
                value: callOrGet(value, state.value),
                lastChanged: now,
                lastTouched: suppressTouch ? state.lastTouched : now,
                isValid: validating ? undefined : true,
                isInvalid: validating ? undefined : false,
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
        update(() => initialFormState(value, errors), ["init"])
    }
    const reinitialize = () => {
        initialize(options.initial.value, options.initial.errors)
    }
    const reset = () => {
        setValue(options.initial.value, true)
        setErrors(options.initial.errors)
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
        update(state => ({ ...state, lastValidateRequested: new Date(), pendingValidations: state.pendingValidations + 1 }), ["beforeValidate"])
        void (async () => {
            try {
                const errors = buildErrors(await validator(value), false)
                const current = validation === latestValidation && equals(state.value, value)
                update(state => {
                    const finished = { ...state, pendingValidations: state.pendingValidations - 1 }
                    if (!current) {
                        return finished
                    }
                    return {
                        ...finished,
                        lastValidated: new Date(),
                        lastValidationResult: errors.length === 0,
                        isValid: errors.length === 0,
                        isInvalid: errors.length > 0,
                        errors,
                    }
                }, current ? ["afterValidate"] : [])
            }
            catch (exception) {
                update(state => ({ ...state, pendingValidations: state.pendingValidations - 1, exception }))
            }
        })()
    }

    // A submission's result is used only if no newer submission has started since.
    const submit = () => {
        latestSubmission += 1
        const submission = latestSubmission
        const value = state.value
        update(state => ({ ...state, lastSubmitRequested: new Date(), pendingSubmissions: state.pendingSubmissions + 1 }), ["beforeSubmit"])
        void (async () => {
            try {
                const errors = buildErrors(await options.submit(value), true)
                const current = submission === latestSubmission
                update(state => {
                    const finished = { ...state, pendingSubmissions: state.pendingSubmissions - 1 }
                    if (!current) {
                        return finished
                    }
                    const date = new Date()
                    const succeeded = errors.length === 0
                    return {
                        ...finished,
                        lastSubmitted: date,
                        lastSubmitValue: value,
                        lastSubmitResult: succeeded,
                        submitCount: state.submitCount + 1,
                        successfulSubmitCount: state.successfulSubmitCount + (succeeded ? 1 : 0),
                        lastSuccessfulSubmit: succeeded ? date : state.lastSuccessfulSubmit,
                        lastSuccessfulSubmitValue: succeeded ? value : state.lastSuccessfulSubmitValue,
                        failedSubmitCount: state.failedSubmitCount + (succeeded ? 0 : 1),
                        lastFailedSubmit: succeeded ? state.lastFailedSubmit : date,
                        lastFailedSubmitValue: succeeded ? state.lastFailedSubmitValue : value,
                        errors,
                    }
                }, current ? ["afterSubmit"] : [])
            }
            catch (exception) {
                update(state => ({ ...state, pendingSubmissions: state.pendingSubmissions - 1, exception }))
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
        updateInitial: (value, errors) => {
            if (equals(initial, { value, errors })) {
                return
            }
            initial = { value, errors }
            const current = deriveFormState(state)
            if (!callOrGet(options.autoUpdate, current)) {
                return
            }
            if (callOrGet(options.reinitializeOnUpdate, current)) {
                reinitialize()
            }
            else {
                reset()
            }
        },
        setValue,
        setErrors,
        mark: event => {
            update(state => ({ ...state, [FIELD_EVENT_DATES[event]]: new Date() }), [event])
        },
        validate,
        submit,
        reset,
        initialize,
        reinitialize,
    }

}
