import React, { ChangeEvent, useMemo, useRef, useState } from 'react'

type ContractStatus = 'borrador' | 'pendiente' | 'enviado'

type ContractFileType = 'pdf' | 'image' | 'word' | 'other'

type ContractItem = {
  id: string
  title: string
  provider: string
  client: string
  notes: string
  status: ContractStatus
  fileName: string
  fileType: ContractFileType
  fileUrl: string
  createdAt: string
}

type ContractForm = {
  title: string
  provider: string
  client: string
  notes: string
}

const EMPTY_FORM: ContractForm = {
  title: '',
  provider: '',
  client: '',
  notes: '',
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function getFileType(file: File): ContractFileType {
  const lowerName = file.name.toLowerCase()

  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf'

  if (
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png')
  ) {
    return 'image'
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    return 'word'
  }

  return 'other'
}

function getFileLabel(fileType: ContractFileType): string {
  if (fileType === 'pdf') return 'PDF'
  if (fileType === 'word') return 'WORD'
  if (fileType === 'image') return 'IMG'
  return 'DOC'
}

function formatDateAR(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function ContractsScreen() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [contracts, setContracts] = useState<ContractItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [form, setForm] = useState<ContractForm>(EMPTY_FORM)

  const selectedContract = useMemo(() => {
    return contracts.find((item) => item.id === selectedId) ?? null
  }, [contracts, selectedId])

  const filteredContracts = useMemo(() => {
    const needle = q.trim().toLowerCase()

    if (!needle) return contracts

    return contracts.filter((item) => {
      const hay = [
        item.title,
        item.provider,
        item.client,
        item.notes,
        item.fileName,
        item.status,
      ]
        .join(' ')
        .toLowerCase()

      return hay.includes(needle)
    })
  }, [contracts, q])

  const totalPendientes = useMemo(() => {
    return contracts.filter((item) => item.status === 'pendiente').length
  }, [contracts])

  const totalEnviados = useMemo(() => {
    return contracts.filter((item) => item.status === 'enviado').length
  }, [contracts])

  function openFilePicker(): void {
    fileInputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]

    if (!file) return

    const fileUrl = URL.createObjectURL(file)
    const fileType = getFileType(file)
    const now = new Date().toISOString()

    const next: ContractItem = {
      id: uid(),
      title: file.name.replace(/\.[^/.]+$/, ''),
      provider: '',
      client: '',
      notes: '',
      status: 'borrador',
      fileName: file.name,
      fileType,
      fileUrl,
      createdAt: now,
    }

    setContracts((prev) => [next, ...prev])
    setSelectedId(next.id)
    setForm({
      title: next.title,
      provider: '',
      client: '',
      notes: '',
    })

    event.target.value = ''
  }

  function selectContract(item: ContractItem): void {
    setSelectedId(item.id)
    setForm({
      title: item.title,
      provider: item.provider,
      client: item.client,
      notes: item.notes,
    })
  }

  function saveChanges(): void {
    if (!selectedContract) return

    const title = form.title.trim()

    setContracts((prev) =>
      prev.map((item) =>
        item.id === selectedContract.id
          ? {
              ...item,
              title: title || item.fileName,
              provider: form.provider.trim(),
              client: form.client.trim(),
              notes: form.notes.trim(),
              status: item.status === 'borrador' ? 'pendiente' : item.status,
            }
          : item,
      ),
    )
  }

  function sendContract(): void {
    if (!selectedContract) return

    saveChanges()

    setContracts((prev) =>
      prev.map((item) =>
        item.id === selectedContract.id
          ? {
              ...item,
              status: 'enviado',
            }
          : item,
      ),
    )

    window.alert('Contrato marcado como enviado. Después conectamos este botón al envío real.')
  }

  function deleteContract(id: string): void {
    const ok = window.confirm('¿Eliminar este contrato?')
    if (!ok) return

    setContracts((prev) => prev.filter((item) => item.id !== id))

    if (selectedId === id) {
      setSelectedId(null)
      setForm(EMPTY_FORM)
    }
  }

  return (
    <main className="contracts-screen">
      <section className="contracts-screen__hero">
        <div>
          <p className="contracts-screen__eyebrow">Gestión documental</p>
          <h1>Mis contratos</h1>
          <p>
            Cargá contratos, visualizalos y prepará los campos necesarios antes de enviarlos.
          </p>
        </div>

        <div className="contracts-screen__stats">
          <span>
            <strong>{contracts.length}</strong>
            Total
          </span>

          <span>
            <strong>{totalPendientes}</strong>
            Pendientes
          </span>

          <span>
            <strong>{totalEnviados}</strong>
            Enviados
          </span>
        </div>
      </section>

      <section className="contracts-screen__layout">
        <div className="contracts-screen__main">
          {!selectedContract ? (
            <section className="contracts-panel">
              <div className="contracts-panel__head">
                <div>
                  <h2>Contratos cargados</h2>
                  <p>Seleccioná un contrato para abrirlo y editar sus campos.</p>
                </div>

                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por contrato, cliente, prestador o archivo..."
                />
              </div>

              <div className="contracts-grid">
                {filteredContracts.length === 0 ? (
                  <div className="contracts-empty">
                    <strong>Todavía no hay contratos cargados.</strong>
                    <span>Usá el botón “Agregar contrato” para subir PDF, JPG, PNG o Word .docx.</span>
                  </div>
                ) : (
                  filteredContracts.map((item) => (
                    <article
                      key={item.id}
                      className="contract-card"
                      onClick={() => selectContract(item)}
                    >
                      <div className="contract-card__preview">
                        {item.fileType === 'image' ? (
                          <img src={item.fileUrl} alt={item.title} />
                        ) : (
                          <div className={`contract-card__fileIcon contract-card__fileIcon--${item.fileType}`}>
                            {getFileLabel(item.fileType)}
                          </div>
                        )}
                      </div>

                      <div className="contract-card__body">
                        <div className="contract-card__top">
                          <h3>{item.title}</h3>
                          <span className={`contract-status contract-status--${item.status}`}>
                            {item.status}
                          </span>
                        </div>

                        <p>{item.fileName}</p>

                        <div className="contract-card__meta">
                          <span>Prestador: {item.provider || '-'}</span>
                          <span>Cliente: {item.client || '-'}</span>
                          <span>Cargado: {formatDateAR(item.createdAt)}</span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          ) : (
            <section className="contract-editor">
              <div className="contract-editor__head">
                <div>
                  <button
                    type="button"
                    className="contract-editor__back"
                    onClick={() => {
                      setSelectedId(null)
                      setForm(EMPTY_FORM)
                    }}
                  >
                    ← Volver a contratos
                  </button>

                  <h2>{selectedContract.title}</h2>
                  <p>{selectedContract.fileName}</p>
                </div>

                <span className={`contract-status contract-status--${selectedContract.status}`}>
                  {selectedContract.status}
                </span>
              </div>

              <div className="contract-editor__layout">
                <div className="contract-editor__viewer">
                  {selectedContract.fileType === 'pdf' ? (
                    <iframe src={selectedContract.fileUrl} title={selectedContract.title} />
                  ) : selectedContract.fileType === 'image' ? (
                    <img src={selectedContract.fileUrl} alt={selectedContract.title} />
                  ) : selectedContract.fileType === 'word' ? (
                    <div className="contract-editor__unsupported">
                      <strong>Contrato Word cargado correctamente.</strong>
                      <span>
                        Los archivos .docx no se pueden previsualizar directamente en el navegador.
                        Después podemos agregar conversión a PDF o edición real de campos.
                      </span>
                    </div>
                  ) : (
                    <div className="contract-editor__unsupported">
                      <strong>Archivo cargado correctamente.</strong>
                      <span>Este tipo de archivo todavía no se puede previsualizar.</span>
                    </div>
                  )}
                </div>

                <aside className="contract-editor__fields">
                  <h3>Campos del contrato</h3>

                  <label>
                    Nombre del contrato
                    <input
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Nombre del contrato"
                    />
                  </label>

                  <label>
                    Prestador
                    <input
                      value={form.provider}
                      onChange={(e) => setForm((p) => ({ ...p, provider: e.target.value }))}
                      placeholder="Prestador asociado"
                    />
                  </label>

                  <label>
                    Cliente / Empresa
                    <input
                      value={form.client}
                      onChange={(e) => setForm((p) => ({ ...p, client: e.target.value }))}
                      placeholder="Cliente o empresa"
                    />
                  </label>

                  <label>
                    Observaciones
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                      placeholder="Notas internas, campos pendientes, condiciones, etc."
                    />
                  </label>

                  <div className="contract-editor__actions">
                    <button type="button" className="btn btn--ghost" onClick={saveChanges}>
                      Guardar cambios
                    </button>

                    <button type="button" className="btn btn--primary" onClick={sendContract}>
                      Enviar contrato
                    </button>
                  </div>
                </aside>
              </div>
            </section>
          )}
        </div>

        <aside className="contracts-sidebar">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx,image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            hidden
          />

          <button type="button" className="contracts-sidebar__add" onClick={openFilePicker}>
            + Agregar contrato
          </button>

          <div className="contracts-sidebar__box">
            <h3>Formatos aceptados</h3>
            <p>PDF, JPG, PNG y Word .docx.</p>
          </div>

          <div className="contracts-sidebar__box">
            <h3>Flujo sugerido</h3>

            <ol>
              <li>Cargá el contrato.</li>
              <li>Abrilo desde la card.</li>
              <li>Completá los campos.</li>
              <li>Presioná enviar contrato.</li>
            </ol>
          </div>

          {selectedContract ? (
            <div className="contracts-sidebar__box">
              <h3>Contrato abierto</h3>
              <p>{selectedContract.title}</p>

              <button
                type="button"
                className="contracts-sidebar__danger"
                onClick={() => deleteContract(selectedContract.id)}
              >
                Eliminar contrato
              </button>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}