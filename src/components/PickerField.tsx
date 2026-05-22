import { useState } from "react";
import { Picker, Popup } from "tdesign-mobile-react";

export type PickerOption = { label: string; value: string };

export function PickerField({
  label,
  value,
  options,
  placeholder = "请选择",
  onChange,
}: {
  label: string;
  value?: string;
  options: PickerOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const safeOptions = options.length ? options : [{ label: "无选项", value: "" }];
  const current = safeOptions.find((option) => option.value === value);

  return (
    <div className="picker-field">
      <span>{label}</span>
      <button
        type="button"
        className="picker-trigger"
        onClick={() => setOpen(true)}
      >
        <strong>{current?.label ?? placeholder}</strong>
        <em>选择</em>
      </button>
      <Popup
        visible={open}
        placement="bottom"
        closeOnOverlayClick
        onClose={() => setOpen(false)}
      >
        <Picker
          title={label}
          columns={safeOptions}
          value={[current?.value ?? safeOptions[0].value]}
          cancelBtn="取消"
          confirmBtn="确定"
          onCancel={() => setOpen(false)}
          onConfirm={(nextValue) => {
            onChange(String(nextValue[0] ?? ""));
            setOpen(false);
          }}
        />
      </Popup>
    </div>
  );
}
