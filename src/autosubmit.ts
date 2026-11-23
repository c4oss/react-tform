import { equals } from "ramda"
import { useCallback, useEffect, useEffectEvent, useState } from "react"
import { FormContext } from "./form.js"
import { useFormAction } from "./hooks.js"

/**
 * An autosave trigger. Immediate will fire on change, delayed will fire on blur and commit.
 */
export type AutoSubmitTrigger = "change" | "touch" | "commit" | "blur" | "focus"

/**
 * The autosave options. Note that you, or the autosave will not take effect.
 * @typeParam T The form's value type.
 */
export interface AutoSubmitOptions<T> {

    /**
     * The form context.
     */
    readonly form: FormContext<T>

    /**
     * Set this to true to disable autosaving.
     */
    readonly disabled?: boolean | undefined

    /**
     * The autosave triggers. We recommend setting the delay to 100 milliseconds at the least, for a debouncing effect.
     */
    readonly on: {

        /**
         * The trigger and debounce time. Note: We recommend NOT to use change. Use touch instead. Change will trigger any time a value is changed. Touch will trigger every time a value is changed unless you pass suppressTouch = true to setValue. This will allow you to make updates that do not trigger an automatic submit.
         */
        readonly [K in AutoSubmitTrigger]?: number | undefined

    }

}

/**
 * The status of a currently activate autosave.
 */
export interface AutoSubmitStatus {

    /**
     * Whether or not this autosave is active. Will be false if the disabled option is passed into useAutoSave.
     */
    readonly active: boolean

    /**
     * When the next autosave will fire, millisecond timestamp.
     */
    readonly next: number | undefined

    /**
     * Whether or not an autosave is pending.
     */
    readonly pending: boolean

    /**
     * The number of autosaves completed.
     */
    // readonly count: number

    /**
     * Cancel any pending autosaves.
     */
    cancel(): void

}

/**
 * Attach autosaving functionality to a form.
 * @typeParam T The form's value type.
 * @param options The configuration object.
 * @returns Autosave status.
 */
export function useAutoSubmit<T>(options: AutoSubmitOptions<T>): AutoSubmitStatus {
    // the value last submitted (by this or any other way: a save button, Enter), as seen when the submission started
    const [submitted, setSubmitted] = useState<T>()
    // Something to save: the value differs from what's saved, and isn't the one last submitted (a failed save isn't
    // tried again until the value changes).
    const active = options.disabled !== true && options.form.disabled !== true && options.form.canSubmit && options.form.dirty && !equals(options.form.value, submitted)
    const [next, setNext] = useState<number>()
    const cancel = useCallback(() => setNext(undefined), [])
    // nothing to save any more: drop a scheduled save, while rendering rather than in an effect after
    if (!active && next !== undefined) {
        setNext(undefined)
    }
    const trigger = (delay?: number | undefined) => {
        if (delay === undefined) {
            return
        }
        if (!active) {
            return
        }
        setNext(Date.now() + delay)
    }
    [
        "change" as const,
        "touch" as const,
        "commit" as const,
        "blur" as const,
        "focus" as const,
    ].forEach(action => {
        useFormAction(options.form, action, () => trigger(options.on?.[action]))
    })
    useEffect(() => {
        if (next === undefined) {
            return
        }
        const timeout = setTimeout(options.form.submit, Math.max(next - Date.now(), 0))
        return () => {
            clearTimeout(timeout)
        }
    }, [
        next
    ])
    useFormAction(options.form, "beforeSubmit", () => {
        cancel()
        setSubmitted(options.form.value)
    })
    // a save still waiting when the form goes away is made now, rather than dropped
    const submitPending = useEffectEvent(() => {
        if (next !== undefined && active) {
            options.form.submit()
        }
    })
    useEffect(() => {
        return () => {
            submitPending()
        }
    }, [])
    return {
        active,
        next,
        pending: next !== undefined,
        cancel
    }
}
