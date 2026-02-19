/**
 * AuthModal – Sign In / Sign Up dialog for cloud save access.
 *
 * Usage:
 *   <AuthModal open={open} onOpenChange={setOpen} />
 */

import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Cloud } from 'lucide-react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Sign-In form
// ---------------------------------------------------------------------------

function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const signIn = useAuthStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await signIn(email.trim(), password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign In'}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Sign-Up form
// ---------------------------------------------------------------------------

function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
  const signUp = useAuthStore((s) => s.signUp)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    const result = await signUp(email.trim(), password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
      // Supabase may require email confirmation depending on project settings.
      // If email confirmation is OFF the user is signed in immediately.
      setTimeout(() => onSuccess(), 1500)
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center space-y-2">
        <p className="text-sm font-medium text-emerald-500">Account created!</p>
        <p className="text-xs text-muted-foreground">
          Check your inbox to confirm your email if required, then sign in.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-confirm">Confirm Password</Label>
        <Input
          id="signup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Creating account…' : 'Create Account'}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  function handleSuccess() {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Cloud className="h-5 w-5 text-primary" />
            <DialogTitle>Cloud Saves</DialogTitle>
          </div>
          <DialogDescription>
            Sign in to sync your saves across devices. Your progress is always
            saved locally first.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="signin">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              Create Account
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="mt-4">
            <SignInForm onSuccess={handleSuccess} />
          </TabsContent>
          <TabsContent value="signup" className="mt-4">
            <SignUpForm onSuccess={handleSuccess} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
