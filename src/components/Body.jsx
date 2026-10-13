import Container from 'react-bootstrap/Container';
import FlashMessage from './FlashMessage';

export default function Body({ children }) {
  return (
    <Container className="Body">
      <Container className="Content">
        <FlashMessage />
        {children}
      </Container>
    </Container>
  );
}
