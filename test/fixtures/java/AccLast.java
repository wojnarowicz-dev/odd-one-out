package fixture.accessors;

// Exercises the accessor filter for `last` paired with `size`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccLast {

    private Probe29 probe;

    public void holds1() {
        probe.last();
        probe.size();
    }

    public void holds2() {
        probe.last();
        probe.size();
    }

    public void holds3() {
        probe.last();
        probe.size();
    }

    public void holds4() {
        probe.last();
        probe.size();
    }

    public void deviates() {
        probe.last();
    }
}
