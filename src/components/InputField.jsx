import Form from 'react-bootstrap/Form';

export default function InputField(
  { name, label, type, placeholder, error, fieldRef, as, rows, autoComplete }
) {
  return (
    <Form.Group controlId={name} className="InputField">
      {label && <Form.Label>{label}</Form.Label>}
      <Form.Control
        as={as}
        rows={rows}
        type={as ? undefined : (type || 'text')}
        placeholder={placeholder}
        autoComplete={autoComplete}
        isInvalid={!!error}
        ref={fieldRef}
      />
      <Form.Text className="text-danger">{error}</Form.Text>
    </Form.Group>
  );
}
