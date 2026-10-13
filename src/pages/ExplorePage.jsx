import Body from '../components/Body';
import Posts from '../components/Posts';

export default function ExplorePage() {
  return (
    <Body sidebar>
      <Posts kind="explore" />
    </Body>
  );
}
