import React, { useEffect, useMemo, useRef, useState } from 'react'
import classNames from 'classnames'
import Checkbox from './Checkbox'
import Dialog, {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  FooterActions,
} from './Dialog'
import FooterActionButton from './Dialog/FooterActionButton'
import useTranslationFunction from '../hooks/useTranslationFunction'

import type { DialogProps } from '../contexts/DialogContext'

import styles from './SmallSelectDialogPrivitty.module.scss'

export type SelectDialogOption = [value: string, label: string]

export type SelectedValue = {
  allowDownload: boolean
  allowForward: boolean
  allowedTime: string // duration in seconds as string
}

type Props = {
  title: string
  initialSelectedValue: SelectedValue
  onSave?: (selectedValue: SelectedValue) => void | Promise<void>
  onSelect?: (selectedValue: SelectedValue) => void
  onCancel?: () => void
  showAllowForward?: boolean
} & DialogProps

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const MERIDIEMS = ['AM', 'PM'] as const

/** Format a Date for datetime-local input: YYYY-MM-DDTHH:mm */
function formatDateTimeLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

/** Get default expiry: current time + 1 day */
function getDefaultExpiryDateTime(): string {
  const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
  defaultDate.setSeconds(0, 0)
  return formatDateTimeLocal(defaultDate)
}

/** Get min datetime for picker: now (rounded to next minute) */
function getMinDateTime(): string {
  const now = new Date()
  now.setSeconds(0, 0)
  return formatDateTimeLocal(now)
}

function getDateAfterDays(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  date.setSeconds(0, 0)
  return formatDateTimeLocal(date)
}

function parseDateTimeLocal(value: string): Date {
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getMonthDays(viewMonth: Date): Date[] {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPadding = firstDay.getDay()
  const days: Date[] = []

  for (let i = startPadding - 1; i >= 0; i -= 1) {
    days.push(new Date(year, month, -i))
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(year, month, day))
  }

  while (days.length % 7 !== 0) {
    const nextDay = days.length - startPadding - lastDay.getDate() + 1
    days.push(new Date(year, month + 1, nextDay))
  }

  return days
}

function isDateDisabled(date: Date, minDate: Date): boolean {
  const endOfDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    0,
    0
  )
  return endOfDay.getTime() < minDate.getTime()
}

function clampDateTimeToMin(date: Date, minDate: Date): Date {
  if (date.getTime() < minDate.getTime()) {
    return new Date(minDate)
  }
  return date
}

function to12Hour(hours24: number): { hour12: number; meridiem: 'AM' | 'PM' } {
  const meridiem = hours24 >= 12 ? 'PM' : 'AM'
  const hour12 = hours24 % 12 || 12
  return { hour12, meridiem }
}

function to24Hour(hour12: number, meridiem: 'AM' | 'PM'): number {
  if (meridiem === 'AM') {
    return hour12 === 12 ? 0 : hour12
  }
  return hour12 === 12 ? 12 : hour12 + 12
}

function isTimeSelectionDisabled(
  hour12: number,
  minute: number,
  meridiem: 'AM' | 'PM',
  selectedDate: Date,
  minDate: Date
): boolean {
  const candidate = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
    to24Hour(hour12, meridiem),
    minute,
    0,
    0
  )
  return candidate.getTime() < minDate.getTime()
}

function formatDisplayValue(value: string): string {
  return parseDateTimeLocal(value).toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export default function SmallSelectDialogPrivitty({
  initialSelectedValue: _initialSelectedValue,
  onSave,
  title,
  onClose,
  onSelect,
  onCancel,
  showAllowForward = true,
}: Props) {
  const tx = useTranslationFunction()
  const pickerRef = useRef<HTMLDivElement>(null)
  const [allowDownload, setAllowDownload] = useState<boolean>(false)
  const [allowForward, setAllowForward] = useState<boolean>(false)
  const [expiryDateTime, setExpiryDateTime] = useState<string>(
    getDefaultExpiryDateTime
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [selectedTab, setSelectedTab] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const initial = parseDateTimeLocal(getDefaultExpiryDateTime())
    return new Date(initial.getFullYear(), initial.getMonth(), 1)
  })

  const minDateTime = useMemo(() => getMinDateTime(), [])
  const minDate = useMemo(() => parseDateTimeLocal(minDateTime), [minDateTime])
  const selectedDate = useMemo(
    () => parseDateTimeLocal(expiryDateTime),
    [expiryDateTime]
  )
  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])
  const monthDays = useMemo(() => getMonthDays(viewMonth), [viewMonth])
  const monthTitle = viewMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const { hour12, meridiem } = to12Hour(selectedDate.getHours())

  useEffect(() => {
    if (!pickerOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (pickerRef.current?.contains(target)) {
        return
      }
      setPickerOpen(false)
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [pickerOpen])

  useEffect(() => {
    if (!pickerOpen || !pickerRef.current) {
      return
    }

    requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelectorAll(`.${styles.timeColumn} .${styles.timeSelected}`)
        .forEach(element => {
          element.scrollIntoView({ block: 'center' })
        })
    })
  }, [pickerOpen, expiryDateTime])

  const saveAndClose = async () => {
    setValidationError(null)

    const selectedEpochMs = new Date(expiryDateTime).getTime()
    const nowMs = Date.now()

    if (selectedEpochMs <= nowMs) {
      setValidationError('Please select a future date and time')
      return
    }

    const durationSeconds = Math.floor((selectedEpochMs - nowMs) / 1000)
    if (durationSeconds <= 0) {
      setValidationError('Invalid time selected')
      return
    }

    const selectedValue: SelectedValue = {
      allowDownload,
      allowForward,
      allowedTime: String(durationSeconds),
    }
    setPickerOpen(false)
    onSelect && onSelect(selectedValue)
    if (onSave) {
      await onSave(selectedValue)
    }
    onClose()
  }

  const handleExpiryChange = (value: string) => {
    setExpiryDateTime(value)
    setSelectedTab(null)
    setValidationError(null)
  }

  const handleTabClick = (days: number) => {
    setSelectedTab(days)
    const nextValue = getDateAfterDays(days)
    handleExpiryChange(nextValue)
    const nextDate = parseDateTimeLocal(nextValue)
    setViewMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
  }

  const handleDateSelect = (day: Date) => {
    if (isDateDisabled(day, minDate)) {
      return
    }

    const nextDate = clampDateTimeToMin(
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        selectedDate.getHours(),
        selectedDate.getMinutes(),
        0,
        0
      ),
      minDate
    )
    handleExpiryChange(formatDateTimeLocal(nextDate))
  }

  const handleHourSelect = (hour: number) => {
    if (
      isTimeSelectionDisabled(
        hour,
        selectedDate.getMinutes(),
        meridiem,
        selectedDate,
        minDate
      )
    ) {
      return
    }

    const nextDate = clampDateTimeToMin(
      new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        to24Hour(hour, meridiem),
        selectedDate.getMinutes(),
        0,
        0
      ),
      minDate
    )
    handleExpiryChange(formatDateTimeLocal(nextDate))
  }

  const handleMinuteSelect = (minute: number) => {
    if (
      isTimeSelectionDisabled(hour12, minute, meridiem, selectedDate, minDate)
    ) {
      return
    }

    const nextDate = clampDateTimeToMin(
      new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        selectedDate.getHours(),
        minute,
        0,
        0
      ),
      minDate
    )
    handleExpiryChange(formatDateTimeLocal(nextDate))
  }

  const handleMeridiemSelect = (nextMeridiem: 'AM' | 'PM') => {
    if (
      isTimeSelectionDisabled(
        hour12,
        selectedDate.getMinutes(),
        nextMeridiem,
        selectedDate,
        minDate
      )
    ) {
      return
    }

    const nextDate = clampDateTimeToMin(
      new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        to24Hour(hour12, nextMeridiem),
        selectedDate.getMinutes(),
        0,
        0
      ),
      minDate
    )
    handleExpiryChange(formatDateTimeLocal(nextDate))
  }

  const handleClear = () => {
    handleExpiryChange(getDefaultExpiryDateTime())
    setPickerOpen(false)
  }

  const handleToday = () => {
    const now = new Date()
    const nextDate = clampDateTimeToMin(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        selectedDate.getHours(),
        selectedDate.getMinutes(),
        0,
        0
      ),
      minDate
    )
    handleExpiryChange(formatDateTimeLocal(nextDate))
    setViewMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
  }

  return (
    <Dialog onClose={onClose}>
      <DialogHeader title={title} />
      <DialogBody>
        <DialogContent>
          <div className={styles.accentControl} style={{ marginBottom: 12 }}>
            <Checkbox
              checked={allowDownload}
              onChange={e => setAllowDownload(e.target.checked)}
              label={<span style={{ marginLeft: '8px' }}>Allow Download</span>}
            />
          </div>
          {showAllowForward && (
            <div className={styles.accentControl} style={{ marginBottom: 12 }}>
              <Checkbox
                checked={allowForward}
                onChange={e => setAllowForward(e.target.checked)}
                label={<span style={{ marginLeft: '8px' }}>Allow Forward</span>}
              />
            </div>
          )}
          <div className={styles.expirySection}>
            <label htmlFor='expiry-datetime' className={styles.expiryLabel}>
              Expiry date and time
            </label>
            <div className={styles.pickerWrap} ref={pickerRef}>
              <input
                id='expiry-datetime'
                readOnly
                value={formatDisplayValue(expiryDateTime)}
                onClick={() => setPickerOpen(open => !open)}
                className={styles.expiryInput}
                aria-expanded={pickerOpen}
                aria-haspopup='dialog'
              />
              {pickerOpen && (
                <div
                  className={styles.pickerPopup}
                  role='dialog'
                  aria-label='Expiry date and time picker'
                >
                  <div className={styles.pickerBody}>
                    <div className={styles.calendarPanel}>
                      <div className={styles.calendarHeader}>
                        <button
                          type='button'
                          className={styles.navButton}
                          onClick={() =>
                            setViewMonth(
                              current =>
                                new Date(
                                  current.getFullYear(),
                                  current.getMonth() - 1,
                                  1
                                )
                            )
                          }
                          aria-label='Previous month'
                        >
                          ‹
                        </button>
                        <span className={styles.monthTitle}>{monthTitle}</span>
                        <button
                          type='button'
                          className={styles.navButton}
                          onClick={() =>
                            setViewMonth(
                              current =>
                                new Date(
                                  current.getFullYear(),
                                  current.getMonth() + 1,
                                  1
                                )
                            )
                          }
                          aria-label='Next month'
                        >
                          ›
                        </button>
                      </div>
                      <div className={styles.weekdayRow} aria-hidden='true'>
                        {WEEKDAYS.map(day => (
                          <span key={day} className={styles.weekday}>
                            {day}
                          </span>
                        ))}
                      </div>
                      <div
                        className={styles.daysGrid}
                        role='grid'
                        aria-label='Calendar'
                      >
                        {monthDays.map(day => {
                          const inCurrentMonth =
                            day.getMonth() === viewMonth.getMonth()
                          const disabled = isDateDisabled(day, minDate)
                          const selected = isSameDay(day, selectedDate)
                          const isToday = isSameDay(day, today)

                          return (
                            <div
                              key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                              className={styles.dayCell}
                            >
                              <button
                                type='button'
                                className={classNames(styles.dayButton, {
                                  [styles.daySelected]: selected,
                                  [styles.dayToday]: isToday,
                                  [styles.dayDisabled]: disabled,
                                  [styles.dayOutside]: !inCurrentMonth,
                                })}
                                onClick={() => handleDateSelect(day)}
                                disabled={disabled}
                                aria-selected={selected}
                                aria-current={isToday ? 'date' : undefined}
                              >
                                {day.getDate()}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className={styles.timePanel}>
                      <div className={styles.timeHeader} aria-hidden='true'>
                        <span className={styles.timeHeaderValue}>
                          {String(hour12).padStart(2, '0')}
                        </span>
                        <span className={styles.timeHeaderValue}>
                          {String(selectedDate.getMinutes()).padStart(2, '0')}
                        </span>
                        <span className={styles.timeHeaderValue}>
                          {meridiem}
                        </span>
                      </div>
                      <div className={styles.timeColumns}>
                        <div
                          className={styles.timeColumn}
                          role='listbox'
                          aria-label='Select hour'
                        >
                          {HOURS_12.map(hour => {
                            const disabled = isTimeSelectionDisabled(
                              hour,
                              selectedDate.getMinutes(),
                              meridiem,
                              selectedDate,
                              minDate
                            )
                            const selected = hour12 === hour

                            return (
                              <button
                                key={`hour-${hour}`}
                                type='button'
                                role='option'
                                aria-selected={selected}
                                className={classNames(styles.timeButton, {
                                  [styles.timeSelected]: selected,
                                  [styles.timeDisabled]: disabled,
                                })}
                                onClick={() => handleHourSelect(hour)}
                                disabled={disabled}
                              >
                                {String(hour).padStart(2, '0')}
                              </button>
                            )
                          })}
                        </div>
                        <div
                          className={styles.timeColumn}
                          role='listbox'
                          aria-label='Select minute'
                        >
                          {MINUTES.map(minute => {
                            const disabled = isTimeSelectionDisabled(
                              hour12,
                              minute,
                              meridiem,
                              selectedDate,
                              minDate
                            )
                            const selected =
                              selectedDate.getMinutes() === minute

                            return (
                              <button
                                key={`minute-${minute}`}
                                type='button'
                                role='option'
                                aria-selected={selected}
                                className={classNames(styles.timeButton, {
                                  [styles.timeSelected]: selected,
                                  [styles.timeDisabled]: disabled,
                                })}
                                onClick={() => handleMinuteSelect(minute)}
                                disabled={disabled}
                              >
                                {String(minute).padStart(2, '0')}
                              </button>
                            )
                          })}
                        </div>
                        <div
                          className={`${styles.timeColumn} ${styles.timeColumnMeridiem}`}
                          role='listbox'
                          aria-label='Select AM or PM'
                        >
                          {MERIDIEMS.map(option => {
                            const disabled = isTimeSelectionDisabled(
                              hour12,
                              selectedDate.getMinutes(),
                              option,
                              selectedDate,
                              minDate
                            )
                            const selected = meridiem === option

                            return (
                              <button
                                key={option}
                                type='button'
                                role='option'
                                aria-selected={selected}
                                className={classNames(styles.timeButton, {
                                  [styles.timeSelected]: selected,
                                  [styles.timeDisabled]: disabled,
                                })}
                                onClick={() => handleMeridiemSelect(option)}
                                disabled={disabled}
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.pickerFooter}>
                    <button
                      type='button'
                      className={styles.footerAction}
                      onClick={handleClear}
                    >
                      Clear
                    </button>
                    <button
                      type='button'
                      className={styles.footerAction}
                      onClick={handleToday}
                    >
                      Today
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {validationError && (
            <div className={styles.validationError} role='alert'>
              {validationError}
            </div>
          )}
          <div className={styles.quickSelectRow}>
            <div className={styles.quickSelectButtons}>
              <button
                type='button'
                className={classNames(styles.quickButton, {
                  [styles.quickButtonSelected]: selectedTab === 2,
                })}
                onClick={() => handleTabClick(2)}
              >
                2 Days
              </button>
              <button
                type='button'
                className={classNames(styles.quickButton, {
                  [styles.quickButtonSelected]: selectedTab === 3,
                })}
                onClick={() => handleTabClick(3)}
              >
                3 Days
              </button>
              <button
                type='button'
                className={classNames(styles.quickButton, {
                  [styles.quickButtonSelected]: selectedTab === 7,
                })}
                onClick={() => handleTabClick(7)}
              >
                1 Week
              </button>
            </div>
          </div>
        </DialogContent>
      </DialogBody>
      <DialogFooter>
        <FooterActions>
          <FooterActionButton
            onClick={() => {
              onCancel && onCancel()
              onClose()
            }}
          >
            {tx('cancel')}
          </FooterActionButton>
          <FooterActionButton styling='primary' onClick={saveAndClose}>
            {tx('save_desktop')}
          </FooterActionButton>
        </FooterActions>
      </DialogFooter>
    </Dialog>
  )
}
