import { useMemo, useState } from 'react';
import { validateProjectForm } from '../utils/validation';
import { notify } from '../utils/notifications';

const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'French', label: 'Français' },
];

const VOICE_OPTIONS = [
  { value: 'english_haseeb', label: 'English – Haseeb' },
  { value: 'french_celine', label: 'Français – Céline' },
];

const DETAIL_OPTIONS = [0, 10, 25, 40, 60].map((value) => ({
  value,
  label: `${value}%`,
}));

const DEFAULT_FORM = {
  language: 'English',
  voice: 'english_haseeb',
  detailPercent: 25,
  gameName: '',
  metadata: {
    publisher: '',
    playerCount: '',
    gameLength: '',
    minimumAge: '',
    theme: '',
    edition: '',
  },
};

export function ProjectForm({ onSubmit, isSubmitting }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [errors, setErrors] = useState({});

  const metadataEntries = useMemo(
    () => [
      { key: 'publisher', label: 'Publisher (e.g., Publisher)' },
      { key: 'playerCount', label: 'Player Count (e.g., 2–4)' },
      { key: 'gameLength', label: 'Game Length (e.g., 30–60 min)' },
      { key: 'minimumAge', label: 'Minimum Age (e.g., 8+)' },
      { key: 'theme', label: 'Theme (e.g., Deep-sea Adventure)' },
      { key: 'edition', label: 'Edition (e.g., Third Edition)' },
    ],
    []
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name.startsWith('metadata.')) {
      const key = name.split('.')[1];
      setForm((prev) => ({
        ...prev,
        metadata: { ...prev.metadata, [key]: value },
      }));
      
      // Clear error for this field when user starts typing
      if (errors[`metadata.${key}`]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[`metadata.${key}`];
          return newErrors;
        });
      }
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
      
      // Clear error for this field when user starts typing
      if (errors[name]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validateProjectForm(form);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      notify.error('Please correct the highlighted fields.');
      return;
    }

    setErrors({});
    await onSubmit(form);
  };

  // Helper function to render input with error styling
  const renderInput = (name, inputProps = {}) => {
    const error = errors[name];
    return (
      <div className="w-full">
        <input
          {...inputProps}
          name={name}
          value={inputProps.value || ''}
          onChange={handleChange}
          className={`mt-1 w-full rounded border px-3 py-2 ${
            error ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  };

  // Helper function to render select with error styling
  const renderSelect = (name, options, selectProps = {}) => {
    const error = errors[name];
    return (
      <div className="w-full">
        <select
          {...selectProps}
          name={name}
          value={selectProps.value || ''}
          onChange={handleChange}
          className={`mt-1 w-full rounded border px-3 py-2 ${
            error ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          {options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <fieldset className="space-y-4">
        <legend className="text-xl font-semibold">Board Game Tutorial Generator</legend>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col text-sm font-medium">
            <label>Language</label>
            {renderSelect('language', LANGUAGE_OPTIONS, {
              value: form.language,
            })}
          </div>

          <div className="flex flex-col text-sm font-medium">
            <label>Voice</label>
            {renderSelect('voice', VOICE_OPTIONS, {
              value: form.voice,
            })}
          </div>

          <div className="flex flex-col text-sm font-medium">
            <label>Detail % Increase</label>
            {renderSelect('detailPercent', DETAIL_OPTIONS, {
              value: form.detailPercent,
            })}
          </div>
        </div>

        <div className="flex flex-col text-sm font-medium">
          <label>Game Name</label>
          {renderInput('gameName', {
            type: 'text',
            value: form.gameName,
            placeholder: 'Enter the game name',
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded border p-4">
        <legend className="text-sm font-semibold">
          Game Metadata (Optional — will attempt extraction if left blank)
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          {metadataEntries.map((entry) => (
            <div key={entry.key} className="flex flex-col text-xs font-medium uppercase tracking-wide">
              <label>{entry.label}</label>
              {renderInput(`metadata.${entry.key}`, {
                type: 'text',
                value: form.metadata[entry.key],
                placeholder: entry.label,
              })}
            </div>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {isSubmitting ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}