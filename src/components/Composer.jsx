import { useState, useEffect, useRef, useMemo } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import CloseButton from 'react-bootstrap/CloseButton';
import Avatar from './Avatar';
import { useUser } from '../contexts/UserProvider';
import { useApi } from '../contexts/ApiProvider';
import { fieldErrorsFromDb } from '../lib/dbErrors';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES, validateImages } from '../lib/media';
import { ACCEPTED_VIDEO_TYPES, MAX_VIDEO_SECONDS, prepareVideo } from '../lib/video';
import { countVideoLinks } from '../lib/embeds';

// Compose box for posts and comments: text (links and video URLs are rendered
// automatically), up to MAX_IMAGES photos and one video: either an uploaded file
// (compressed in the browser, see lib/video.js) or a video link, not both.
// `onSubmit({ body, files, keepPaths, video, keepVideo })` must return `{ error }`;
// the box clears itself on success.
// Edit mode: pass `initialBody` / `initialPaths` / `initialVideo` (already uploaded
// files, which the user can remove) and `onCancel`.
// Shown under the post composer (superuser): how the post layout works.
export const POST_TIP = 'One video per post (upload it or paste a link) plays at the top. Put [photo 1] on its own line to place photo 1 between paragraphs.';

export default function Composer({
  placeholder, submitLabel, onSubmit, autoFocus = false, initialBody = '', initialPaths = [], initialVideo = null,
  onCancel, tip,
}) {
  const [formErrors, setFormErrors] = useState({});
  const [files, setFiles] = useState([]);
  const [keepPaths, setKeepPaths] = useState(initialPaths);
  const [keepVideo, setKeepVideo] = useState(!!initialVideo);
  const [video, setVideo] = useState(null);         // prepared File to upload
  const [preparing, setPreparing] = useState(null); // compression progress 0..1, or null
  const [uploading, setUploading] = useState(null); // video upload progress 0..1, or null
  const videoInput = useRef();
  const videoPreview = useObjectUrl(video);
  const api = useApi();
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
    const error = validateImages(next, keepPaths.length);
    if (error) {
      setFormErrors({ images: error });
      return;
    }
    setFormErrors({});
    setFiles(next);
  };

  const removeFile = (index) => setFiles(files.filter((_, i) => i !== index));

  const pickVideo = async (ev) => {
    const picked = ev.target.files[0];
    ev.target.value = '';
    if (!picked) return;
    if (countVideoLinks(textField.current.value) > 0) {
      setFormErrors({ video: ONE_VIDEO });
      return;
    }
    setFormErrors({});
    setPreparing(0);
    const { file, error } = await prepareVideo(picked, setPreparing);
    setPreparing(null);
    if (error) {
      setFormErrors({ video: error });
      return;
    }
    setVideo(file);
    setKeepVideo(false);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const body = textField.current.value.trim();
    const hasVideo = !!video || keepVideo;
    if (!body && files.length === 0 && keepPaths.length === 0 && !hasVideo) {
      setFormErrors({ body: 'Write something or attach a photo or video.' });
      return;
    }
    const links = countVideoLinks(body);
    if (links > 1 || (links > 0 && hasVideo)) {
      setFormErrors({ body: ONE_VIDEO });
      return;
    }
    setBusy(true);
    if (video) setUploading(0);
    const { error } = await onSubmit({ body, files, keepPaths, video, keepVideo, onVideoProgress: setUploading });
    setUploading(null);
    setBusy(false);
    if (error) {
      setFormErrors(fieldErrorsFromDb(error) || { body: error.message });
    }
    else {
      setFormErrors({});
      setFiles([]);
      setVideo(null);
      textField.current.value = '';
    }
  };

  return (
    <Form onSubmit={handleSubmit} className="Card Composer">
      <div className="Composer-row">
        <span className="Composer-avatar"><Avatar user={user} size={40} /></span>
        <Form.Control
          as="textarea" rows={3} name="body" ref={textField} defaultValue={initialBody}
          placeholder={placeholder} aria-label={placeholder}
          isInvalid={!!formErrors.body} className="Composer-input" />
      </div>
      {tip && <div className="Composer-tip">{tip}</div>}
      {formErrors.body && <div className="Composer-error">{formErrors.body}</div>}
      {keepPaths.length + previews.length > 0 &&
        <div className="ImagePreviews">
          {keepPaths.map((path, i) =>
            <div key={path} className="ImagePreview">
              <img src={api.mediaUrl(path)} alt={`Photo ${i + 1}`} />
              <CloseButton aria-label={`Remove photo ${i + 1}`}
                onClick={() => setKeepPaths(keepPaths.filter((p) => p !== path))} />
            </div>
          )}
          {previews.map((url, i) =>
            <div key={url} className="ImagePreview">
              <img src={url} alt={files[i].name} />
              <CloseButton aria-label={`Remove ${files[i].name}`} onClick={() => removeFile(i)} />
            </div>
          )}
        </div>
      }
      {formErrors.images && <div className="Composer-error">{formErrors.images}</div>}
      {(video || keepVideo) &&
        <div className="VideoPreview">
          <video src={video ? videoPreview : api.videoUrl(initialVideo)} controls playsInline muted
            preload="metadata" aria-label="Video preview" />
          <CloseButton aria-label="Remove video"
            onClick={() => { setVideo(null); setKeepVideo(false); }} />
        </div>
      }
      {preparing !== null &&
        <div className="Composer-tip" role="status">Preparing video… {Math.round(preparing * 100)}%</div>
      }
      {uploading !== null &&
        <div className="Composer-tip" role="status">Uploading video… {Math.round(uploading * 100)}%</div>
      }
      {formErrors.video && <div className="Composer-error">{formErrors.video}</div>}
      <div className="Composer-actions">
        <Button variant="light" className="Composer-photo" disabled={busy || keepPaths.length + files.length >= MAX_IMAGES}
          aria-label="Photo" onClick={() => fileInput.current.click()}>
          <CameraIcon /> <span className="Composer-label">Photo</span>
        </Button>
        <Button variant="light" className="Composer-photo"
          disabled={busy || preparing !== null || !!video || keepVideo}
          title={`One video, up to ${MAX_VIDEO_SECONDS} seconds`} aria-label="Video"
          onClick={() => videoInput.current.click()}>
          <VideoIcon /> <span className="Composer-label">Video</span>
        </Button>
        {onCancel ?
          <>
            <span className="Composer-hint" />
            <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
          </>
        :
          <span className="Composer-hint">{tip ? '' : 'Video links embed automatically'}</span>
        }
        <Button variant="success" type="submit" disabled={busy || preparing !== null} className="Composer-submit">
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
      <input ref={fileInput} type="file" accept={ACCEPTED_IMAGE_TYPES} multiple hidden
        data-testid="image-input" onChange={addFiles} />
      <input ref={videoInput} type="file" accept={ACCEPTED_VIDEO_TYPES} hidden
        data-testid="video-input" onChange={pickVideo} />
    </Form>
  );
}

const ONE_VIDEO = 'One video per post or comment: keep either the uploaded video or a single video link.';

function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function useFilePreviews(files) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
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
