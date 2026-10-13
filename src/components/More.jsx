import Button from 'react-bootstrap/Button';

export default function More({ more, loadNextPage }) {
  return (
    <div className="More">
      {more &&
        <Button variant="outline-success" className="w-100" onClick={loadNextPage}>
          Load more
        </Button>
      }
    </div>
  );
}
