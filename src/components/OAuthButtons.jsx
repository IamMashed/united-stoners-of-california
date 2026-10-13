import Stack from 'react-bootstrap/Stack';
import Button from 'react-bootstrap/Button';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

const LABELS = { github: 'GitHub', google: 'Google' };

export function enabledProviders() {
  return (import.meta.env.VITE_OAUTH_PROVIDERS || '')
    .split(',').map((p) => p.trim()).filter((p) => p in LABELS);
}

export default function OAuthButtons() {
  const { loginWithProvider } = useUser();
  const flash = useFlash();
  const providers = enabledProviders();

  if (providers.length === 0) {
    return null;
  }

  const onClick = async (provider) => {
    const { error } = await loginWithProvider(provider);
    if (error) {
      flash(`Could not sign in with ${LABELS[provider]}: ${error.message}`, 'danger');
    }
  };

  return (
    <>
      <div className="Divider"><span>or</span></div>
      <Stack gap={2} className="OAuthButtons">
        {providers.map((provider) =>
          <Button key={provider} variant="outline-dark" onClick={() => onClick(provider)}>
            Continue with {LABELS[provider]}
          </Button>
        )}
      </Stack>
    </>
  );
}
