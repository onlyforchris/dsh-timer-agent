/**
 * Styled single-select: closed control + popup list.
 * Native <select> option menus cannot be themed on Windows; this keeps the
 * board/modal look consistent with other form controls.
 */
import { useEffect, useId, useRef, useState } from 'react'
import css from '../board.module.css'

export interface SelectOption {
  value: string
  label: string
}

export function SelectField({
  value,
  options,
  ariaLabel,
  className,
  onChange,
}: {
  value: string
  options: ReadonlyArray<SelectOption>
  ariaLabel: string
  className?: string
  onChange(value: string): void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = options.find(option => option.value === value) ?? options[0]
  const display = current?.label ?? ''

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`${css.selectField}${className !== undefined ? ` ${className}` : ''}`}>
      <button
        type="button"
        className={css.selectTrigger}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => { setOpen(prev => !prev) }}
      >
        <span className={css.selectValue}>{display}</span>
        <span className={css.selectChevron} aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className={css.selectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map(option => {
            const selected = option.value === value
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`${css.selectOption}${selected ? ` ${css.selectOptionActive}` : ''}`}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
