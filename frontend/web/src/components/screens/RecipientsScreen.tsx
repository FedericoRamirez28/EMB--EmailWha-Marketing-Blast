import React, { useState } from 'react'
import RecipientsPanel from '@/components/ui/RecipientsPanel'
import type { Recipient } from '@/lib/recipientsApi'

export function RecipientsScreen() {
  const [sel, setSel] = useState<Recipient[]>([])

  return (
    <div style={{ padding: 18 }}>
      <RecipientsPanel onSelectionChange={setSel} />
      <pre style={{ marginTop: 12, opacity: 0.7 }}>{JSON.stringify(sel, null, 2)}</pre>
    </div>
  )
}
