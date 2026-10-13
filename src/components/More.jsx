import Button from 'react-bootstrap/Button';

export default function More({ more, loadNextPage }) {
  return (
    <div className="More">
      {more &&
        <Button variant="outline-success" onClick={loadNextPage}>
          More &raquo;
        </Button>
      }
    </div>
  );
}
