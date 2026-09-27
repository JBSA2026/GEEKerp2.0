import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, LockKeyhole, UserRound, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import geekWallpaper from '@/assets/geek-wallpaper.png'
import { login } from '@/utils/api'

export default function Login({ onLogin }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)  // returns decoded JWT payload
      await onLogin(user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-stage">
      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <form
          onSubmit={handleSubmit}
          className="login-card w-full max-w-[420px] rounded-[28px] border border-[#d8e2ef] bg-white p-8 text-center shadow-[0_30px_90px_rgba(30,41,59,0.08)]"
        >
          <div className="mx-auto overflow-hidden rounded-2xl border border-[#d8e2ef] bg-white shadow-sm">
            <img
              src={geekWallpaper}
              alt="GEEK"
              className="h-28 w-full object-cover object-bottom"
            />
          </div>

          <p className="mt-6 text-sm text-slate-500">Sign in to continue.</p>

          <div className="mt-8 space-y-4 text-left">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500">Email</span>
              <div className="flex items-center gap-3 rounded-xl border border-[#d8e2ef] bg-[#f6f8fc] px-3.5 py-3 transition focus-within:border-[#2c3a61] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(44,58,97,0.1)]">
                <UserRound size={16} className="text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="you@company.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500">Password</span>
              <div className="flex items-center gap-3 rounded-xl border border-[#d8e2ef] bg-[#f6f8fc] px-3.5 py-3 transition focus-within:border-[#2c3a61] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(44,58,97,0.1)]">
                <LockKeyhole size={16} className="text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="text-slate-400 hover:text-slate-600 transition"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5">
                <span className="text-rose-400 shrink-0">⚠</span>
                <p className="text-xs text-rose-600">{error}</p>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="mt-7 h-11 w-full justify-center text-sm"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
            <ArrowRight size={16} className="transition" />
          </Button>
        </form>
      </section>
    </main>
  )
}
