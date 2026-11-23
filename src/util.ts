import { equals } from "ramda"
import { DependencyList, useMemo, useRef } from "react"

export function useDeepCompareMemo<T, TDeps extends DependencyList>(factory: () => T, deps: TDeps) {
    const ref = useRef<TDeps | undefined>(undefined)
    if (ref.current === undefined || !equals(deps, ref.current)) {
        ref.current = deps
    }
    return useMemo(factory, ref.current)
}

export function useDeepCompareConstant<T>(value: T) {
    return useDeepCompareMemo(() => value, [value])
}
