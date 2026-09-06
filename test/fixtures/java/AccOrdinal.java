package fixture.accessors;

// Exercises the accessor filter for `ordinal` paired with `value`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccOrdinal {

    private Probe16 probe;

    public void holds1() {
        probe.ordinal();
        probe.value();
    }

    public void holds2() {
        probe.ordinal();
        probe.value();
    }

    public void holds3() {
        probe.ordinal();
        probe.value();
    }

    public void holds4() {
        probe.ordinal();
        probe.value();
    }

    public void deviates() {
        probe.ordinal();
    }
}
