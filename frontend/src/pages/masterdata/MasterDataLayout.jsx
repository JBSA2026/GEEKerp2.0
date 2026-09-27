import { Outlet, useOutletContext } from 'react-router-dom'

export function MasterDataLayout() {
  const { user } = useOutletContext()
  return <Outlet context={{ user }} />
}
