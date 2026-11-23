import { isNotNil } from "ramda"
import { useLayoutEffect } from "react"
import { FormContext } from "./form.js"
import { FormAction } from "./options.js"

/**
 * The events of a form that actions can be attached to (see `useFormAction` and the form's `on` option).
 */
export const FORM_HOOK_KEYS = [
    "change",
    "touch",
    "commit",
    "blur",
    "focus",
    "init",
    "beforeSubmit",
    "afterSubmit",
    "beforeValidate",
    "afterValidate",
] as const

/**
 * An event type for the form.
 */
export type FormHook = typeof FORM_HOOK_KEYS[number]

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
