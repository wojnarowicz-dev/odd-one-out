package fixture.accessors;

// Exercises the accessor filter for `compareTo` paired with `name`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccCompareTo {

    private Probe14 probe;

    public void holds1() {
        probe.compareTo();
        probe.name();
    }

    public void holds2() {
        probe.compareTo();
        probe.name();
    }

    public void holds3() {
        probe.compareTo();
        probe.name();
    }

    public void holds4() {
        probe.compareTo();
        probe.name();
    }

    public void deviates() {
        probe.compareTo();
    }
}
