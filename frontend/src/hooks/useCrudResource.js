import { useCallback, useState } from 'react'
import { deleteRecord } from '@/utils/api'

export function useCrudResource({ resource, getId, getName, setItems, confirmDelete, confirm }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerKey, setDrawerKey] = useState(0)
  const [selectedItem, setSelectedItem] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)

  const openCreate = useCallback(() => {
    setSelectedItem(null)
    setDrawerKey(key => key + 1)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback(item => {
    setSelectedItem(item)
    setDrawerKey(key => key + 1)
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const handleSaved = useCallback(savedItem => {
    const savedId = getId(savedItem)
    const previousId = selectedItem ? getId(selectedItem) : savedId

    setItems(previousItems => {
      const exists = previousItems.some(item => getId(item) === previousId)
      return exists
        ? previousItems.map(item => getId(item) === previousId ? savedItem : item)
        : [savedItem, ...previousItems]
    })
  }, [getId, selectedItem, setItems])

  const handleDelete = useCallback(async item => {
    const id = getId(item)
    const name = getName(item) || id
    const message = confirmDelete
      ? confirmDelete(item)
      : `Delete ${name}? This cannot be undone.`

    if (!confirm) {
      setError('Delete confirmation is not configured.')
      return
    }
    const ok = await confirm({
      title: 'Delete record?',
      message,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return

    setDeletingId(id)
    setError(null)
    try {
      await deleteRecord(resource, id)
      setItems(previousItems => previousItems.filter(row => getId(row) !== id))
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setDeletingId(null)
    }
  }, [confirm, confirmDelete, getId, getName, resource, setItems])

  return {
    drawerOpen,
    drawerKey,
    selectedItem,
    deletingId,
    error,
    setError,
    openCreate,
    openEdit,
    closeDrawer,
    handleSaved,
    handleDelete,
  }
}
