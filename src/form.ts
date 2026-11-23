import { isNotNil } from "ramda"
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react"
import { FormErrors } from "./errors.js"
import { FormField, FormFieldImpl } from "./field.js"
import { FORM_HOOK_KEYS, FormHook } from "./hooks.js"
import { FormOptions } from "./options.js"
import { FormState, deriveFormState } from "./state.js"
import { createFormStore } from "./store.js"
import { useDeepCompareConstant } from "./util.js"

export interface FormHandlers {

    readonly onKeyUp: ((event: React.KeyboardEvent<HTMLElement>) => void) | undefined

}

/**
 * A full form object, including state and mutation methods.
 * @typeParam T The value type.
 */
export interface FormContext<T> extends FormState<T>, FormField<T> {

    /**
     * Validate this form.
     */
    readonly validate: () => void

    /**
     * Submit this form.
     */
    readonly submit: (event?: FormEvent<unknown> | undefined) => void

    /**
     * Reinitialize this form. Clears all state, including errors and submission history.
     * @deprecated
     */
    readonly initialize: (value: T, errors?: FormErrors | undefined) => void

    /**
     * Reinitialize this form. Clears all state, including errors and submission history.
     * @deprecated
     */
    readonly reinitialize: () => void

    /**
     * Reset to the provided initial values.
     */
    readonly reset: () => void

    /**
     * Listen for form hooks. Each runs the listener once, after React has rendered the change. Returns a function
     * that stops listening. See `useFormAction`, which listens for the life of a component.
     */
    readonly listen: (hooks: readonly FormHook[], listener: () => void) => () => void

    /**
     * An onKeyUp handler for non-form root elements. If the form is disabled, this will be undefined.
     */
    readonly handlers: FormHandlers

}

/**
 * Generate a form.
 * @typeParam T The value type.
 * @param options Form options.
 * @returns A form context.
 */
export function useForm<T>(options: FormOptions<T>): FormContext<T> {

    // The form's state lives in a store, created once: its actions act on its current state straight away.

    const [store] = useState(() => createFormStore(options))
    useLayoutEffect(() => {
        store.setOptions(options)
    })
    const state = deriveFormState(useSyncExternalStore(store.subscribe, store.getState))

    // Follow the initial value (and errors) as the options say to. The store ignores ones it has already applied, so
    // running this again (a hot reload) doesn't reset the form.

    const initialValue = useDeepCompareConstant(options.initial.value)
    const initialErrors = useDeepCompareConstant(options.initial.errors)
    useEffect(() => {
        store.updateInitial(initialValue, initialErrors)
    }, [
        store,
        initialValue,
        initialErrors,
    ])

    // The root form group.

    const group = FormFieldImpl.from({
        path: [],
        value: state.value,
        setValue: store.setValue,
        errors: state.errors,
        setErrors: store.setErrors,
        disabled: options.disabled,
        touch: () => store.mark("touch"),
        blur: () => store.mark("blur"),
        commit: () => store.mark("commit"),
        focus: () => store.mark("focus"),
    })

    const submit = useCallback((event?: FormEvent<unknown> | undefined) => {
        event?.preventDefault()
        store.submit()
    }, [
        store
    ])
    const handlers = useMemo(() => {
        return {
            onKeyUp: (() => {
                if (options.disabled) {
                    return
                }
                return (event: React.KeyboardEvent<HTMLElement>) => {
                    if (event.target instanceof HTMLInputElement && event.key === "Enter") {
                        store.submit()
                    }
                }
            })()
        }
    }, [
        store,
        options.disabled,
    ])

    const context = {
        ...state,
        ...group,
        initialValue,
        initialize: store.initialize,
        reinitialize: store.reinitialize,
        reset: store.reset,
        validate: store.validate,
        submit,
        setErrors: store.setErrors,
        listen: store.listen,
        handlers,
    }

    // The actions in the options, and validation, run on the hooks they're for: listened for after every render, so
    // they run with this render's form.

    const validateOn = options.validateOn ?? "change"
    const validateStart = options.validateStart ?? "immediate"
    useLayoutEffect(() => {
        const stops = FORM_HOOK_KEYS.map(hook => {
            return store.listen([hook], () => {
                const actions = [options.on?.[hook]].flat().filter(isNotNil)
                actions.forEach(action => {
                    typeof action === "string" ? context[action]() : action(context)
                })
            })
        })
        const stopValidating = store.listen([validateOn], () => {
            if (validateStart === "afterFirstSubmission" && !state.hasBeenSubmitted) {
                return
            }
            store.validate()
        })
        return () => {
            [...stops, stopValidating].forEach(stop => stop())
        }
    })

    // Deliver the events of this render's changes, now that their listeners are in place.

    useEffect(() => {
        store.flush()
    })

    if (state.exception !== undefined) {
        throw state.exception
    }

    return context

}
