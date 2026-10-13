import FlashMessage from './FlashMessage';

// Page shell. `form` renders a narrow card for login/registration/settings pages.
export default function Body({ form, title, children }) {
  return (
    <main className={form ? 'Page Page-form' : 'Page'}>
      <FlashMessage />
      {form ?
        <section className="Card FormCard">
          {title && <h1 className="FormCard-title">{title}</h1>}
          {children}
        </section>
      :
        children
      }
    </main>
  );
}
