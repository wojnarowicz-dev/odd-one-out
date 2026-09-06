package fixture.accessors;

// Exercises the accessor filter for `value` paired with `values`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccValue {

    private Probe17 probe;

    public void holds1() {
        probe.value();
        probe.values();
    }

    public void holds2() {
        probe.value();
        probe.values();
    }

    public void holds3() {
        probe.value();
        probe.values();
    }

    public void holds4() {
        probe.value();
        probe.values();
    }

    public void deviates() {
        probe.value();
    }
}
