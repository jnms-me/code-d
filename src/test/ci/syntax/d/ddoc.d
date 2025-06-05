/**
 * Some module docs.
 *
 * $(NOTE Note that `/*` is allowed here.
 * `/+` and `+/` as well.)
 *
 * Authors: Me
 */
module ddoc;

/++ 
 + Can also use nesting blocks for ddoc.
 +
 + Things like `/*` and `*/` work here.
 + Every `/+` or `/++` has to match its `+/+/`, though.
 +/
struct S
{
    /// Single line ddoc, anything goes /*+/
    void a()
    {
    }
}

void a() {/**/}
void b() {/++/}