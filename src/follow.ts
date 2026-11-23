import { equals } from "ramda"
import { useEffect, useEffectEvent, useState } from "react"
import { FormContext } from "./form.js"
import { FormInitial } from "./options.js"
import { useDeepCompareConstant } from "./util.js"

/**
 * What `useFollowInitial` has to tell.
 * @typeParam T The form's value type.
 */
export interface FollowInitialStatus<T> {

    /**
     * A newer initial value that arrived while the form had unsaved edits, waiting for the user to take it or not.
     */
    readonly externalChange: FormInitial<T> | undefined

    /**
     * Take the waiting `externalChange`, dropping the unsaved edits.
     */
    readonly apply: () => void

    /**
     * Keep the unsaved edits, and stop offering the `externalChange`.
     */
    readonly dismiss: () => void

}

/**
 * Follow a form's initial value as it changes (a record edited elsewhere, say). With no unsaved edits, the form takes it
 * straight away. With unsaved edits, they're kept, and the new value waits as `externalChange` for the user to take
 * (`apply`) or not (`dismiss`). Use instead of the form's `autoUpdate`.
 * @typeParam T The form's value type.
 * @param form The form.
 * @param initial The initial value (and errors) to follow: the same one the form was given.
 * @returns The waiting change, and what to do with it.
 */
export function useFollowInitial<T>(form: FormContext<T>, initial: FormInitial<T>): FollowInitialStatus<T> {
    const value = useDeepCompareConstant(initial.value)
    const errors = useDeepCompareConstant(initial.errors)
    const [externalChange, setExternalChange] = useState<FormInitial<T>>()
    // no unsaved edits any more (saved, or reset): nothing left to choose between, while rendering rather than after
    if (externalChange !== undefined && !form.dirty) {
        setExternalChange(undefined)
    }
    const take = useEffectEvent((next: FormInitial<T>) => {
        // Nothing to tell: the form already has it, or it's what the form has as saved (which includes this form's own
        // save coming back). Running this again for the same value (a hot reload) lands here, so it changes nothing.
        if (equals(next.value, form.value) || equals(next.value, form.savedValue)) {
            setExternalChange(undefined)
            return
        }
        if (form.dirty) {
            setExternalChange(next)
            return
        }
        form.follow(next)
    })
    useEffect(() => {
        take({ value, errors })
    }, [
        value,
        errors,
    ])
    return {
        externalChange,
        apply: () => {
            if (externalChange !== undefined) {
                form.follow(externalChange)
                setExternalChange(undefined)
            }
        },
        dismiss: () => setExternalChange(undefined),
    }
}
