package fixture.accessors;

// Exercises the accessor filter for `keySet` paired with `entrySet`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccKeySet {

    private Probe19 probe;

    public void holds1() {
        probe.keySet();
        probe.entrySet();
    }

    public void holds2() {
        probe.keySet();
        probe.entrySet();
    }

    public void holds3() {
        probe.keySet();
        probe.entrySet();
    }

    public void holds4() {
        probe.keySet();
        probe.entrySet();
    }

    public void deviates() {
        probe.keySet();
    }
}
