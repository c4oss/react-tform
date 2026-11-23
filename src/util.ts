import { equals } from "ramda"
import { DependencyList, useMemo, useState } from "react"

/**
 * Like useMemo, but its dependencies are compared deeply: only a real change makes it compute again. The last
 * dependencies are kept in state and compared during render (adjusting state during render, as React recommends), so a
 * render React throws away changes nothing.
 */
export function useDeepCompareMemo<T, TDeps extends DependencyList>(factory: () => T, deps: TDeps) {
    const [kept, setKept] = useState<TDeps>(deps)
    const same = equals(kept, deps)
    if (!same) {
        setKept(deps)
    }
    return useMemo(factory, same ? kept : deps)
}

export function useDeepCompareConstant<T>(value: T) {
    return useDeepCompareMemo(() => value, [value])
}
