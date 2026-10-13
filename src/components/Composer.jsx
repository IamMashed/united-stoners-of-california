import { useState, useEffect, useRef, useMemo } from 'react';
import Stack from 'react-bootstrap/Stack';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import CloseButton from 'react-bootstrap/CloseButton';
import Avatar from './Avatar';
import InputField from './InputField';
import { useUser } from '../contexts/UserProvider';
import { fieldErrorsFromDb } from '../lib/dbErrors';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES, validateImages } from '../lib/media';

// Compose box for posts and comments: text (links and video URLs are rendered
// automatically) plus up to MAX_IMAGES photos. `onSubmit({ body, files })` must
// return `{ error }`; the box clears itself on success.
export default function Composer({ placeholder, submitLabel, onSubmit, autoFocus = true }) {
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
    <Stack direction="horizontal" gap={3} className="Write">
      <Avatar user={user} size={64} />
      <Form onSubmit={handleSubmit}>
        <InputField
          name="body" as="textarea" rows={3} placeholder={placeholder}
          error={formErrors.body} fieldRef={textField} />
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
        {formErrors.images && <Form.Text className="text-danger d-block">{formErrors.images}</Form.Text>}
        <Stack direction="horizontal" gap={2} className="mt-2">
          <Button variant="success" type="submit" disabled={busy}>
            {busy ? 'Posting…' : submitLabel}
          </Button>
          <Button variant="outline-secondary" disabled={busy || files.length >= MAX_IMAGES}
            onClick={() => fileInput.current.click()}>
            📷 Add photos
          </Button>
          <Form.Text className="text-muted ms-auto d-none d-md-block">
            Paste a YouTube, Vimeo, TikTok or Instagram link to embed a video.
          </Form.Text>
        </Stack>
        <input ref={fileInput} type="file" accept={ACCEPTED_IMAGE_TYPES} multiple hidden
          data-testid="image-input" onChange={addFiles} />
      </Form>
    </Stack>
  );
}

function useFilePreviews(files) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}
