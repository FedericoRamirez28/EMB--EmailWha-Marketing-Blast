import React, { useState } from 'react'
import RecipientsPanel from '@/components/ui/RecipientsPanel'
import type { Recipient } from '@/lib/recipientsApi'

export function RecipientsScreen() {
  const [sel, setSel] = useState<Recipient[]>([])

  return (
    <div className="recipientsScreen">
      <div className="recipientsScreen__panelWrap">
        <RecipientsPanel onSelectionChange={setSel} />
      </div>

      {/* Debug (no rompe alto): scrollea adentro si es grande */}
      <pre className="recipientsScreen__debug">{JSON.stringify(sel, null, 2)}</pre>
    </div>
  )
}