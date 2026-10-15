import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="Footer">
      <Link to="/contact" className="Footer-link">Contact us</Link>
      <span className="Footer-note">Educational content for adults 21+ in California.</span>
    </footer>
  );
}
