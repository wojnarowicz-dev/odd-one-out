package fixture.accessors;

// Exercises the accessor filter for `values` paired with `keySet`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccValues {

    private Probe18 probe;

    public void holds1() {
        probe.values();
        probe.keySet();
    }

    public void holds2() {
        probe.values();
        probe.keySet();
    }

    public void holds3() {
        probe.values();
        probe.keySet();
    }

    public void holds4() {
        probe.values();
        probe.keySet();
    }

    public void deviates() {
        probe.values();
    }
}
