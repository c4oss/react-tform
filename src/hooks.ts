import { isNotNil } from "ramda"
import { useLayoutEffect } from "react"
import { FormContext } from "./form.js"
import { FormAction } from "./options.js"
import { FormState } from "./state.js"

export const FORM_HOOKS = {

    change: <T>(context: FormState<T>) => context.lastChanged,
    //changeByUserAction: <T>(context: FormState<T>) => context.lastChangedByUserAction,
    //changeByApi: <T>(context: FormState<T>) => context.lastChangedByApi,
    touch: <T>(context: FormState<T>) => context.lastTouched,
    commit: <T>(context: FormState<T>) => context.lastCommitted,
    blur: <T>(context: FormState<T>) => context.lastBlurred,
    focus: <T>(context: FormState<T>) => context.lastFocused,
    init: <T>(context: FormState<T>) => context.lastInitialized,
    beforeSubmit: <T>(context: FormState<T>) => context.lastSubmitRequested,
    afterSubmit: <T>(context: FormState<T>) => context.lastSubmitted,
    beforeValidate: <T>(context: FormState<T>) => context.lastValidateRequested,
    afterValidate: <T>(context: FormState<T>) => context.lastValidated,

} as const

export const FORM_HOOK_KEYS = Object.keys(FORM_HOOKS) as readonly FormHook[]

/**
 * An event type for the form.
 */
export type FormHook = keyof typeof FORM_HOOKS

/**
 * Attach a callback to a form hook. It runs once each time the hook's event happens, after React has rendered the
 * change, with the form as it then is.
 * @param form The form.
 * @param hooks Which hook to trigger on.
 * @param callback The callback to run.
 */
export function useFormAction<T>(form: FormContext<T>, hooks: FormHook | undefined | readonly FormHook[], action: FormAction<T>) {
    // Listens again after every render, so the action is always this render's, with this render's form. Events are
    // delivered after layout effects, so they always find these listeners.
    useLayoutEffect(() => {
        const keys = [hooks].flat().filter(isNotNil)
        return form.listen(keys, () => {
            typeof action === "string" ? form[action]() : action(form)
        })
    })
}
