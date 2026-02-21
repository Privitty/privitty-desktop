import React from 'react'

export interface CheckboxProps {
  checked: boolean
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  label: string
}

const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, label }) => {
  return (
    <div>
      <input type='checkbox' checked={checked} onChange={onChange} />
      <label>{label}</label>
    </div>
  )
}

export default Checkbox
