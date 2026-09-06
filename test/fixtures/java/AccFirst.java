package fixture.accessors;

// Exercises the accessor filter for `first` paired with `last`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccFirst {

    private Probe28 probe;

    public void holds1() {
        probe.first();
        probe.last();
    }

    public void holds2() {
        probe.first();
        probe.last();
    }

    public void holds3() {
        probe.first();
        probe.last();
    }

    public void holds4() {
        probe.first();
        probe.last();
    }

    public void deviates() {
        probe.first();
    }
}
