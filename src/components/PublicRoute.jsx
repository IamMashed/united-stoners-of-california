import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserProvider';

// Pages for logged-out visitors. Once a user is logged in (including right after
// submitting the login form) they are sent on to the page they originally wanted.
export default function PublicRoute({ children }) {
  const { user } = useUser();
  const location = useLocation();

  if (user === undefined) {
    return null;
  }
  else if (user) {
    return <Navigate to={location.state?.next || '/'} replace />;
  }
  else {
    return children;
  }
}
