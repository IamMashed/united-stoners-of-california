import { useState, useEffect, useRef, useMemo } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import CloseButton from 'react-bootstrap/CloseButton';
import Avatar from './Avatar';
import { useUser } from '../contexts/UserProvider';
import { fieldErrorsFromDb } from '../lib/dbErrors';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES, validateImages } from '../lib/media';

// Compose box for posts and comments: text (links and video URLs are rendered
// automatically) plus up to MAX_IMAGES photos. `onSubmit({ body, files })` must
// return `{ error }`; the box clears itself on success.
export default function Composer({ placeholder, submitLabel, onSubmit, autoFocus = false }) {
  const [formErrors, setFormErrors] = useState({});
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const textField = useRef();
  const fileInput = useRef();
  const { user } = useUser();
  const previews = useFilePreviews(files);

  useEffect(() => {
    if (autoFocus) textField.current.focus();
  }, [autoFocus]);

  const addFiles = (ev) => {
    const next = [...files, ...ev.target.files];
    ev.target.value = '';
    const error = validateImages(next);
    if (error) {
      setFormErrors({ images: error });
      return;
    }
    setFormErrors({});
    setFiles(next);
  };

  const removeFile = (index) => setFiles(files.filter((_, i) => i !== index));

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const body = textField.current.value.trim();
    if (!body && files.length === 0) {
      setFormErrors({ body: 'Write something or attach a photo.' });
      return;
    }
    setBusy(true);
    const { error } = await onSubmit({ body, files });
    setBusy(false);
    if (error) {
      setFormErrors(fieldErrorsFromDb(error) || { body: error.message });
    }
    else {
      setFormErrors({});
      setFiles([]);
      textField.current.value = '';
    }
  };

  return (
    <Form onSubmit={handleSubmit} className="Card Composer">
      <div className="Composer-row">
        <span className="Composer-avatar"><Avatar user={user} size={40} /></span>
        <Form.Control
          as="textarea" rows={3} name="body" ref={textField}
          placeholder={placeholder} aria-label={placeholder}
          isInvalid={!!formErrors.body} className="Composer-input" />
      </div>
      {formErrors.body && <div className="Composer-error">{formErrors.body}</div>}
      {previews.length > 0 &&
        <div className="ImagePreviews">
          {previews.map((url, i) =>
            <div key={url} className="ImagePreview">
              <img src={url} alt={files[i].name} />
              <CloseButton aria-label={`Remove ${files[i].name}`} onClick={() => removeFile(i)} />
            </div>
          )}
        </div>
      }
      {formErrors.images && <div className="Composer-error">{formErrors.images}</div>}
      <div className="Composer-actions">
        <Button variant="light" className="Composer-photo" disabled={busy || files.length >= MAX_IMAGES}
          onClick={() => fileInput.current.click()}>
          <CameraIcon /> <span>Photo</span>
        </Button>
        <span className="Composer-hint">Video links embed automatically</span>
        <Button variant="success" type="submit" disabled={busy} className="Composer-submit">
          {busy ? 'Posting…' : submitLabel}
        </Button>
      </div>
      <input ref={fileInput} type="file" accept={ACCEPTED_IMAGE_TYPES} multiple hidden
        data-testid="image-input" onChange={addFiles} />
    </Form>
  );
}

function useFilePreviews(files) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
