import { useCallback, useState } from 'react'

export function useConfirmDialog() {
  const [options, setOptions] = useState(null)

  const confirm = useCallback((nextOptions = {}) => {
    return new Promise(resolve => {
      setOptions({
        title: 'Confirm action',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        danger: false,
        ...nextOptions,
        onConfirm: () => {
          setOptions(null)
          resolve(true)
        },
        onCancel: () => {
          setOptions(null)
          resolve(false)
        },
      })
    })
  }, [])

  const close = useCallback(() => setOptions(null), [])

  return {
    confirm,
    confirmDialogProps: options ? { open: true, ...options } : { open: false, onCancel: close },
  }
}
