package fixture.accessors;

// Exercises the accessor filter for `length` paired with `count`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccLength {

    private Probe1 probe;

    public void holds1() {
        probe.length();
        probe.count();
    }

    public void holds2() {
        probe.length();
        probe.count();
    }

    public void holds3() {
        probe.length();
        probe.count();
    }

    public void holds4() {
        probe.length();
        probe.count();
    }

    public void deviates() {
        probe.length();
    }
}
