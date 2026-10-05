# Why there is no front end

Gingr is a database with a subscription. Underneath it are ordinary records: owners, pets, vaccinations, runs, bookings, care notes, incidents, packages and payments. What you pay for is the layer on top that lets people who do not write database queries get at them: the lodging calendar, the check-in screen, the dashboards.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code and say "who is coming in tomorrow, and whose vaccination is not current?" and it runs the right command and answers. Ask a question the dashboard never had a report for and you still get an answer.

## What you gain

- **Better answers.** Which nights over Christmas are already full, which regulars have stopped coming, which owners owe money and have booked again. Ask it in your own words.
- **The rules checked for you.** Vaccination cover, isolation, admission records and medication logs, against the code that applies to your site, every time you ask.
- **No per-location fee.** A second site is a row in a table.
- **Your data in a database you own.** Back it up, query it from anything, leave any time.

## What a screen gives that this does not

- **A drag-and-drop lodging calendar.** Here occupancy is a table and a printed page (`npm run view`), and moving a dog is one line.
- **An owner app and online booking.** Owners here book by phone, email or a form you choose. Enterprise DNA builds an online booking page when you want one.
- **Report card photos.** The go-home note here is text from the care log.
- **Taking card payments.** This records payments; it does not process them.
- **Tablet check-in at the front desk.** It runs where Claude Code runs: a laptop at the desk works.

## Who this fits

Kennels, catteries and daycares whose owner or manager would rather ask than click, and who want the rules checked without paying for a top tier. If your front desk needs a screen all day, keep Gingr, or have Enterprise DNA build a simple screen on top of this database.

Installed and run for you: https://enterprisedna.co/omni/instead-of/gingr
