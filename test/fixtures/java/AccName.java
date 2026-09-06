package fixture.accessors;

// Exercises the accessor filter for `name` paired with `ordinal`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccName {

    private Probe15 probe;

    public void holds1() {
        probe.name();
        probe.ordinal();
    }

    public void holds2() {
        probe.name();
        probe.ordinal();
    }

    public void holds3() {
        probe.name();
        probe.ordinal();
    }

    public void holds4() {
        probe.name();
        probe.ordinal();
    }

    public void deviates() {
        probe.name();
    }
}
