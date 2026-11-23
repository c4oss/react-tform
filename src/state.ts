import { FormErrors } from "./errors.js"

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
     * The initialized value of the form.
     */
    readonly initializedValue: T

    /**
     * The form's errors.
     */
    readonly errors?: FormErrors | undefined

    readonly lastInitialized: Date
    readonly lastBlurred?: Date | undefined
    readonly lastFocused?: Date | undefined
    readonly lastTouched?: Date | undefined
    readonly lastChanged?: Date | undefined
    readonly lastCommitted?: Date | undefined

    /**
     * Validation history.
     */
    readonly lastValidateRequested?: Date | undefined
    readonly lastValidated?: Date | undefined
    readonly lastValidationResult?: boolean | undefined
    readonly isValid?: boolean | undefined
    readonly isInvalid?: boolean | undefined

    /**
     * How many validations have started and not yet finished.
     */
    readonly pendingValidations: number

    /**
     * The most recently submitted value.
     */
    readonly lastSubmitRequested?: Date | undefined
    readonly lastSubmitted?: Date | undefined
    readonly lastSubmitValue?: T | undefined
    readonly lastSubmitResult?: boolean | undefined
    readonly submitCount: number

    readonly lastSuccessfulSubmit?: Date | undefined
    readonly lastSuccessfulSubmitValue?: T | undefined
    readonly successfulSubmitCount: number

    readonly lastFailedSubmit?: Date | undefined
    readonly lastFailedSubmitValue?: T | undefined
    readonly failedSubmitCount: number

    /**
     * How many submissions have started and not yet finished.
     */
    readonly pendingSubmissions: number

}

/**
 * Build the initial form state.
 * @param initialValue The form's value.
 * @returns An initial form state.
 */
export function initialFormState<T>(initialValue: T, initialErrors?: FormErrors | undefined): FormInternalState<T> {
    return {
        lastInitialized: new Date(),
        initializedValue: initialValue,
        value: initialValue,
        errors: initialErrors,
        pendingValidations: 0,
        submitCount: 0,
        successfulSubmitCount: 0,
        failedSubmitCount: 0,
        pendingSubmissions: 0,
    }
}

/**
 * The form's state, with what can be worked out from it.
 */
export function deriveFormState<T>(state: FormInternalState<T>) {
    return {
        ...state,
        isValidating: state.pendingValidations > 0,
        isSubmitting: state.pendingSubmissions > 0,
        canSubmit: !(state.errors ?? []).some(error => error.temporary !== true),
        hasBeenSubmitted: state.submitCount > 0,
        dirty: (state.lastChanged?.getTime() ?? 0) > state.lastInitialized.getTime() && (state.lastChanged?.getTime() ?? 0) > (state.lastSuccessfulSubmit?.getTime() ?? 0),
    }
}

export type FormState<T> = Readonly<ReturnType<typeof deriveFormState<T>>>
