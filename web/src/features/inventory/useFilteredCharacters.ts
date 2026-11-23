import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ELEMENTS, WEAPONS } from '@/domain/character'
import { CHARACTERS } from '@/domain/characters'
import type { Inventory } from '@/domain/inventory'
import {
  DEFAULT_FILTER,
  filterCharacters,
  filterFromParams,
  filterToParams,
  isFilterActive,
  type InventoryFilter,
} from './filter'

const ALLOWED = { elements: ELEMENTS, weapons: WEAPONS }

export function useFilteredCharacters(inventory: Inventory) {
  const [params, setParams] = useSearchParams()

  const filter = useMemo(() => filterFromParams(params, ALLOWED), [params])

  const setFilter = useCallback(
    (next: InventoryFilter) => {
      setParams(filterToParams(next), { replace: true })
    },
    [setParams],
  )

  const resetFilter = useCallback(() => {
    setParams(filterToParams({ ...DEFAULT_FILTER, sort: filter.sort }), { replace: true })
  }, [filter.sort, setParams])

  const characters = useMemo(
    () => filterCharacters(CHARACTERS, inventory, filter),
    [inventory, filter],
  )

  return {
    filter,
    setFilter,
    resetFilter,
    characters,
    isFiltered: isFilterActive(filter),
  }
}
