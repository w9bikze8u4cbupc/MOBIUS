import React, { useState, useRef, useEffect, useMemo } from 'react';

function App() {
  const [components, setComponents] = useState([]);
  const [newComponentName, setNewComponentName] = useState('');
  const [newComponentQuantity, setNewComponentQuantity] = useState('');

  const handleComponentChange = (idx, field, value) => {
    const updated = [...components];
    updated[idx] = {
      ...updated[idx],
      [field]: field === 'quantity' ? (value === '' ? '' : Number(value)) : value,
    };
    setComponents(updated);
  };

  const toggleComponentSelected = idx => {
    const updated = [...components];
    updated[idx] = { ...updated[idx], selected: !updated[idx].selected };
    setComponents(updated);
  };

  const handleAddComponent = () => {
    if (!newComponentName.trim()) return;
    const newComp = {
      name: newComponentName.trim(),
      quantity: newComponentQuantity ? Number(newComponentQuantity) : null,
      selected: true,
    };
    const updated = [...components, newComp];
    setComponents(updated);
    setNewComponentName('');
    setNewComponentQuantity('');
  };

  const handleRemoveComponent = idx => {
    const updated = components.filter((_, i) => i !== idx);
    setComponents(updated);
  };

  return (
    <div>
      <h1>Test</h1>
    </div>
  );
}

export default App;