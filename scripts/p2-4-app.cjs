const fs = require('fs')
const p = 'E:/Movie Vault/src/renderer/src/App.tsx'
let s = fs.readFileSync(p, 'utf8')
const crlf = s.includes('\r\n')
if (crlf) s = s.replace(/\r\n/g, '\n')

// 1) alert -> toast
const alerts = [
  ["window.alert(t('app.noFilePathCannotDelete'))", "toast({ text: t('app.noFilePathCannotDelete'), tone: 'err' })"],
  ["window.alert(t('app.deletePrecheckFailed') + inspect.error)", "toast({ text: t('app.deletePrecheckFailed') + inspect.error, tone: 'err' })"],
  ["window.alert(t('app.deleteFailed') + (r.error ?? t('app.unknownError')))", "toast({ text: t('app.deleteFailed') + (r.error ?? t('app.unknownError')), tone: 'err' })"],
  ["window.alert(t('app.deleteFailed') + ((e as Error)?.message ?? String(e)))", "toast({ text: t('app.deleteFailed') + ((e as Error)?.message ?? String(e)), tone: 'err' })"],
  ["window.alert(t('app.wrongPasswordDelete'))", "toast({ text: t('app.wrongPasswordDelete'), tone: 'err' })"]
]
let alertCount = 0
for (const [old, ne] of alerts) {
  let n = 0
  while (s.includes(old)) { s = s.replace(old, ne); n++ }
  alertCount += n
}

// 2) split confirmDelete: password gate -> doDelete
const oldC = `  const confirmDelete = useCallback(async () => {
    if (!deletePreview || deleting) return
    if (settings.lockHash) {
      const pwd = window.prompt(t('app.privacyLockPrompt'))
      if (pwd == null) return
      const ok = await api.lockVerify(pwd)
      if (!ok) {
        toast({ text: t('app.wrongPasswordDelete'), tone: 'err' })
        return
      }
    }
    const fileName = deletePreview.fileName`
if (!s.includes(oldC)) { console.log('WARN confirmDelete head not found'); process.exit(1) }
s = s.replace(oldC, `  const doDelete = useCallback(async () => {
    if (!deletePreview || deleting) return
    const fileName = deletePreview.fileName`)

const oldTail = `    } finally {
      setDeleting(false)
    }
  }, [deletePreview, deleting, libraryId])

  const handleDetailFetched`
if (!s.includes(oldTail)) { console.log('WARN doDelete tail not found'); process.exit(1) }
s = s.replace(oldTail, `    } finally {
      setDeleting(false)
    }
  }, [deletePreview, deleting, libraryId])

  const confirmDelete = useCallback(async () => {
    if (!deletePreview || deleting) return
    if (settings.lockHash) {
      setPwdPrompt({ title: t('app.privacyLockPrompt'), onOk: () => void doDelete() })
      return
    }
    await doDelete()
  }, [deletePreview, deleting, settings.lockHash, doDelete])

  const handleDetailFetched`)

// 3) split handleRemoveLibrary
const oldR = `  const handleRemoveLibrary = useCallback(async () => {
    if (!currentLibrary) return
    if (settings.lockHash) {
      const pwd = window.prompt(t('app.privacyLockDeleteLib'))
      if (pwd == null) return
      const ok = await api.lockVerify(pwd)
      if (!ok) {
        toast({ text: t('app.wrongPasswordDelete'), tone: 'err' })
        return
      }
    }
    await api.libraryRemove(currentLibrary.id)`
if (!s.includes(oldR)) { console.log('WARN removeLibrary head not found'); process.exit(1) }
s = s.replace(oldR, `  const doRemoveLibrary = useCallback(async () => {
    if (!currentLibrary) return
    await api.libraryRemove(currentLibrary.id)`)

const oldRTail = `    const rest = libraries.filter((l) => l.id !== currentLibrary.id)
    setLibraryId(rest[0]?.id ?? '')
  }, [currentLibrary, libraries])

  const handleSaveMeta`
if (!s.includes(oldRTail)) { console.log('WARN removeLibrary tail not found'); process.exit(1) }
s = s.replace(oldRTail, `    const rest = libraries.filter((l) => l.id !== currentLibrary.id)
    setLibraryId(rest[0]?.id ?? '')
  }, [currentLibrary, libraries])

  const handleRemoveLibrary = useCallback(async () => {
    if (!currentLibrary) return
    if (settings.lockHash) {
      setPwdPrompt({ title: t('app.privacyLockDeleteLib'), onOk: () => void doRemoveLibrary() })
      return
    }
    await doRemoveLibrary()
  }, [currentLibrary, settings.lockHash, doRemoveLibrary])

  const handleSaveMeta`)

// 4) render PasswordPromptModal before UninstallConfirmModal
const renderAnchor = '      <ConfirmDeleteModal'
if (!s.includes(renderAnchor)) { console.log('WARN render anchor not found'); process.exit(1) }
s = s.replace(renderAnchor, `      {pwdPrompt ? (
        <PasswordPromptModal
          title={pwdPrompt.title}
          onSubmit={async (pwd) => {
            const ok = await api.lockVerify(pwd)
            if (!ok) toast({ text: t('app.wrongPasswordDelete'), tone: 'err' })
            else {
              setPwdPrompt(null)
              pwdPrompt.onOk()
            }
            return ok
          }}
          onCancel={() => setPwdPrompt(null)}
        />
      ) : null}
      <ConfirmDeleteModal`)

if (crlf) s = s.replace(/\n/g, '\r\n')
fs.writeFileSync(p, s)
console.log('App.tsx patched; alerts replaced:', alertCount)
