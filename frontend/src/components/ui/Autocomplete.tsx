import { useEffect, useMemo, useRef, useState } from 'react'

export default function Autocomplete({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 8)
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 8)
  }, [query, options])

  return (
    <div className="relative" ref={rootRef}>
      <input
        className="input-field"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto glass rounded-2xl py-1 shadow-xl">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                className="w-full text-left px-4 py-2 text-sm text-son-silver hover:bg-white/5 hover:text-white"
                onClick={() => {
                  onChange(opt)
                  setQuery(opt)
                  setOpen(false)
                }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
