import { equals } from "ramda"
import { FormErrors } from "./errors.js"
import type { FormInitial } from "./options.js"

/**
 * A form's internal state.
 */
export interface FormInternalState<T> {

    /**
     * The last exception to occur within submission or validation.
     */
    readonly exception?: unknown

    /**
     * The current value of the form.
     */
    readonly value: T

    /**
     * The value known to be saved: the one the form was loaded with, or followed (see `useFollowInitial`), or last saved
     * successfully. The form is dirty while its value differs from it.
     */
    readonly savedValue: T

    /**
     * The form's errors.
     */
    readonly errors?: FormErrors | undefined

    /**
     * Whether the form has been submitted (a submission has finished, whether it succeeded or not).
     */
    readonly submitted: boolean

    /**
     * Whether a submission is running (they run one at a time).
     */
    readonly submitting: boolean

}

/**
 * Build the initial form state.
 * @param initial The form's value and errors.
 * @returns An initial form state.
 */
export function initialFormState<T>(initial: FormInitial<T>): FormInternalState<T> {
    return {
        value: initial.value,
        savedValue: initial.value,
        errors: initial.errors,
        submitted: false,
        submitting: false,
    }
}

/**
 * The form's state, with what can be worked out from it.
 */
export function deriveFormState<T>(state: FormInternalState<T>) {
    return {
        ...state,
        canSubmit: !(state.errors ?? []).some(error => error.temporary !== true),
        dirty: !equals(state.value, state.savedValue),
    }
}

export type FormState<T> = Readonly<ReturnType<typeof deriveFormState<T>>>
