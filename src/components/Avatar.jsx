import Image from 'react-bootstrap/Image';
import { avatarUrl } from '../lib/avatar';

export default function Avatar({ user, size }) {
  return (
    <Image
      src={avatarUrl(user?.avatar_url, size)}
      alt={user?.username || ''}
      width={size} height={size}
      roundedCircle
      className="Avatar"
      referrerPolicy="no-referrer"
    />
  );
}
