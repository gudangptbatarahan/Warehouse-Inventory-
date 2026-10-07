import React, { useState, useEffect, useRef } from 'react';

export interface NumericQuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
}

/**
 * NumericQuantityInput
 * Implements strict warehouse input specifications:
 * 1. Default Value / State Awal: Selalu menampilkan angka 0.
 * 2. Perilaku Input (Overtype/Auto-replace): Saat bernilai 0 dan user mengetik angka pertama (misal: 5),
 *    angka 0 otomatis terganti menjadi 5 (bukan 05 atau 50).
 * 3. Perilaku Backspace/Hapus: Jika user menghapus seluruh angka hingga kosong,
 *    input otomatis kembali menjadi 0 (tidak boleh blank/kosong).
 */
export const NumericQuantityInput: React.FC<NumericQuantityInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  className = '',
  placeholder = '0',
  disabled = false,
  required = false,
  id,
  name,
  autoFocus = false,
}) => {
  // String state representing the displayed text
  const initialNum = isNaN(value) ? 0 : Number(value);
  const [displayVal, setDisplayVal] = useState<string>(String(initialNum));
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize when external value changes
  useEffect(() => {
    const num = isNaN(value) ? 0 : Number(value);
    setDisplayVal(String(num));
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // If value is 0, auto-select it so any typed character immediately overwrites it
    if (e.target.value === '0') {
      e.target.select();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Intercept backspace when deleting the last remaining digit or full selection
    if (e.key === 'Backspace') {
      const el = e.currentTarget;
      const selStart = el.selectionStart ?? 0;
      const selEnd = el.selectionEnd ?? 0;
      const val = el.value;

      // If user deletes the entire selection or the last digit
      if ((selStart === 0 && selEnd === val.length) || val.length <= 1) {
        e.preventDefault();
        setDisplayVal('0');
        onChange(0);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.select();
          }
        }, 0);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Filter only digits
    const digitsOnly = raw.replace(/\D/g, '');

    // Rule 3: If empty, automatically restore to '0'
    if (!digitsOnly || digitsOnly === '') {
      setDisplayVal('0');
      onChange(0);
      return;
    }

    // Rule 2: Overtype/Auto-replace leading 0
    // If string starts with 0 and has more digits (e.g., '05'), strip leading zeros
    let cleaned = digitsOnly;
    if (cleaned.length > 1 && cleaned.startsWith('0')) {
      cleaned = cleaned.replace(/^0+/, '');
      if (cleaned === '') cleaned = '0';
    }

    let parsed = parseInt(cleaned, 10);
    if (isNaN(parsed)) parsed = 0;

    if (min !== undefined && parsed < min) {
      parsed = min;
      cleaned = String(min);
    }
    if (max !== undefined && parsed > max) {
      parsed = max;
      cleaned = String(max);
    }

    setDisplayVal(cleaned);
    onChange(parsed);
  };

  const handleBlur = () => {
    if (!displayVal || displayVal === '' || isNaN(Number(displayVal))) {
      setDisplayVal('0');
      onChange(0);
    } else {
      const num = Number(displayVal);
      setDisplayVal(String(num));
      onChange(num);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      id={id}
      name={name}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      value={displayVal}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
};
