package fixture.accessors;

// Exercises the accessor filter for `containsKey` paired with `containsValue`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccContainsKey {

    private Probe8 probe;

    public void holds1() {
        probe.containsKey();
        probe.containsValue();
    }

    public void holds2() {
        probe.containsKey();
        probe.containsValue();
    }

    public void holds3() {
        probe.containsKey();
        probe.containsValue();
    }

    public void holds4() {
        probe.containsKey();
        probe.containsValue();
    }

    public void deviates() {
        probe.containsKey();
    }
}
