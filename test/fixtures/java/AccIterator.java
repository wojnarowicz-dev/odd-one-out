package fixture.accessors;

// Exercises the accessor filter for `iterator` paired with `stream`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccIterator {

    private Probe21 probe;

    public void holds1() {
        probe.iterator();
        probe.stream();
    }

    public void holds2() {
        probe.iterator();
        probe.stream();
    }

    public void holds3() {
        probe.iterator();
        probe.stream();
    }

    public void holds4() {
        probe.iterator();
        probe.stream();
    }

    public void deviates() {
        probe.iterator();
    }
}
