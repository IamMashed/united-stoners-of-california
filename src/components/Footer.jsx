import { Link } from 'react-router-dom';
import { useUser } from '../contexts/UserProvider';

export default function Footer() {
  const { user } = useUser();

  return (
    <footer className="Footer">
      {/* Contact is members-only, so visitors don't see the link at all. */}
      {user && <Link to="/contact" className="Footer-link">Contact us</Link>}
      <span className="Footer-note">Educational content for adults 21+ in California.</span>
    </footer>
  );
}
